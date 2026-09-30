"""Closed-loop scenario runner.

Steps a synthetic polar station one hour at a time and, in lock-step, runs the EMS-controlled
plant and two rule-based baseline plants on *identical* weather, demand and faults -- so every
KPI difference is caused by the control strategy alone.

The same class drives the headless CLI demo and the live web dashboard.
"""
from __future__ import annotations

import threading
import time
from collections import deque
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd

from .anomaly import AnomalyDetector
from .config import StationConfig
from .ems import EMS, Decision
from .edge_io import TelemetryBus
from .forecasting import HORIZON, ForecastBundle
from .physics import astro_frame
from .plant import Plant, RuleBasedController
from .simulator import ASTRO_COLS, NWP_COLS, Fault, FaultInjector, World
from .store import JsonlSink, Store

WARMUP = 72  # hours of history the EMS starts with
NWP_CYCLE_H = 6  # a new weather forecast arrives every 6 h while the link is up

SCENARIOS: dict[str, dict] = {
    "summer": dict(start="2025-01-05", days=7, desc="Austral summer: midnight sun, full summer crew."),
    "winter": dict(start="2025-06-18", days=7, desc="Polar night: zero PV, heavy heating load, wind and diesel only."),
    "coldsnap": dict(
        start="2025-04-10", days=7,
        events=[dict(kind="cold_snap", at_h=48, hours=72, delta_c=-14.0)],
        desc="Autumn cold snap: -14 degC for 3 days; the weather forecast only anticipates 60% of it.",
    ),
    "faults": dict(
        start="2025-01-05", days=5,
        faults=[
            dict(kind="pv_fault", at_h=20, hours=18, magnitude=0.35),
            dict(kind="ghi_spike", at_h=50, hours=2, magnitude=3.0),
            dict(kind="wind_flatline", at_h=66, hours=10),
            dict(kind="gen_fuel_leak", at_h=84, hours=14, magnitude=1.5, target=0),
        ],
        desc="Equipment and sensor faults: PV string failure, irradiance-sensor glitch, frozen anemometer, fuel-hungry generator.",
    ),
    "offline": dict(
        start="2025-03-01", days=6, link_outages=[(30, 60)],
        desc="60 h satellite blackout: the EMS must run on its local-only forecast model and buffer its logs.",
    ),
}


class Simulation:
    def __init__(
        self,
        cfg: StationConfig,
        bundle: ForecastBundle,
        detector: AnomalyDetector,
        scenario: str = "summer",
        days: int | None = None,
        seed: int = 1,
        store: Store | None = None,
        sink: Callable[[str, dict], None] | None = None,
        bus: TelemetryBus | None = None,
        baselines: bool = True,
    ):
        if scenario not in SCENARIOS:
            raise KeyError(f"unknown scenario {scenario!r}; choose from {sorted(SCENARIOS)}")
        self.cfg, self.scenario, self.seed = cfg, scenario, seed
        sc = SCENARIOS[scenario]
        self.days = days or sc["days"]
        self.lock = threading.RLock()

        start = pd.Timestamp(sc["start"]) - pd.Timedelta(hours=WARMUP)
        hours = WARMUP + 24 * self.days + HORIZON + 60
        self.world = World(cfg, start, hours, seed=seed)
        for ev in sc.get("events", []):
            if ev["kind"] == "cold_snap":
                self.world.add_cold_snap(WARMUP + ev["at_h"], ev["hours"], ev["delta_c"])
        self.df = self.world.frame()

        self.faults = FaultInjector()
        for f in sc.get("faults", []):
            if WARMUP + f["at_h"] < WARMUP + 24 * self.days:
                self.faults.add(Fault(f["kind"], WARMUP + f["at_h"], f["hours"], f.get("magnitude", 1.0), f.get("target", 0)))
        self._outages = [(WARMUP + a, WARMUP + a + b) for a, b in sc.get("link_outages", [])]

        self.i = WARMUP
        self.end = WARMUP + 24 * self.days
        self.link_up = True
        self._link_changed = True
        self.remote: list[tuple[str, dict]] = []
        self._sink = sink or (lambda topic, payload: self.remote.append((topic, payload)))

        detector.reset_state()
        self.plant = Plant(cfg)
        self.ems = EMS(cfg, bundle, detector, store=store, bus=bus)
        self.ems.seed_history(self.df.iloc[:WARMUP])
        self.baselines: dict[str, tuple[Plant, RuleBasedController]] = {}
        if baselines:
            self.baselines = {
                "baseline_soc": (Plant(cfg), RuleBasedController(cfg, "soc_cycle_charging")),
                "baseline_diesel": (Plant(cfg), RuleBasedController(cfg, "diesel_always_on")),
            }
        self.records: list[dict] = []
        self.version = 0
        self.last_decision: Decision | None = None

    # ------------------------------------------------------------------ status
    @property
    def done(self) -> bool:
        return self.i >= self.end

    @property
    def now(self) -> pd.Timestamp:
        return self.df.index[min(self.i, len(self.df) - 1)]

    # ---------------------------------------------------------- interventions
    def set_link(self, up: bool) -> None:
        with self.lock:
            if up != self.link_up:
                self.link_up, self._link_changed = up, True

    def inject_fault(self, kind: str, hours: int = 12, magnitude: float = 1.0, target: int = 0) -> None:
        with self.lock:
            self.faults.add(Fault(kind, self.i, int(hours), float(magnitude), int(target)))

    def inject_cold_snap(self, hours: int = 48, delta_c: float = -12.0) -> None:
        with self.lock:
            self.world.add_cold_snap(self.i, int(hours), float(delta_c))
            self.df = self.world.frame()

    def set_override(self, gen: int, mode: str | None) -> None:
        with self.lock:
            self.ems.set_override(gen, mode)

    # -------------------------------------------------------------------- step
    def _scheduled_link(self, i: int) -> None:
        for a, b in self._outages:
            if i == a and self.link_up:
                self.link_up, self._link_changed = False, True
            if i == b and not self.link_up:
                self.link_up, self._link_changed = True, True

    def step(self) -> dict | None:
        with self.lock:
            if self.done:
                return None
            t_start = time.perf_counter()
            i, cfg = self.i, self.cfg
            ts = self.df.index[i]
            self._scheduled_link(i)

            # weather forecast arrives over the satellite link, when there is one
            e = self.ems
            if self.link_up and (e.nwp_issued is None or (ts - e.nwp_issued) >= pd.Timedelta(hours=NWP_CYCLE_H) or self._link_changed):
                e.receive_nwp(self.df.iloc[i : i + 48][NWP_COLS], issued=ts)
            self._link_changed = False

            mult = self.faults.fuel_multipliers(i, len(cfg.generators))
            for plant in [self.plant] + [p for p, _ in self.baselines.values()]:
                plant.fuel_fault = list(mult)

            # 1) EMS decides from data up to the previous hour
            dec = e.decide(self.plant.copy_state_for_optimizer())
            self.last_decision = dec

            # 2) the world happens
            row = self.df.iloc[i]
            actual = {k: float(row[k]) for k in ("pv_kw", "wind_kw", "load_kw", "ghi", "temp", "wind_speed")}
            physical, measured, labels = self.faults.apply(i, actual)
            res = self.plant.step(dec.dispatch, physical)
            for plant, ctl in self.baselines.values():
                plant.step(ctl.dispatch(plant, physical), physical)

            # 3) telemetry back into the EMS
            gens = [{"on": res.gen_on[k], "kw": res.gen_kw[k], "fuel_lph": res.fuel_lph[k]} for k in range(len(cfg.generators))]
            new, resolved = e.ingest(ts, measured, gens, self.plant.soc_frac())
            e.sync(self.link_up, self._sink)

            fc0 = dec.forecast.iloc[0]
            rec = {
                "i": i, "ts": ts.isoformat(),
                "pv": physical["pv_kw"], "wind": physical["wind_kw"], "load": physical["load_kw"],
                "gen_kw": list(res.gen_kw), "gen_on": list(res.gen_on), "fuel_lph": list(res.fuel_lph),
                "batt_kw": res.batt_kw, "soc": self.plant.soc_frac(), "curtailed": res.curtailed,
                "shed": res.shed, "unserved": res.unserved, "fuel_l": res.fuel_l,
                "fc_pv": float(fc0["pv_kw"]), "fc_wind": float(fc0["wind_kw"]), "fc_load": float(fc0["load_kw"]),
                "temp": physical["temp"], "wind_speed": physical["wind_speed"], "ghi": physical["ghi"],
                "sun_elev": float(row["sun_elev"]), "faults": labels,
                "mode": dec.forecast_mode, "safe": dec.safe_mode,
                "solve_s": None if dec.plan is None else dec.plan.solve_s,
                "link_up": self.link_up,
                "new_alerts": [a.key for a in new],
                "base_fuel": {n: p.totals.fuel_l for n, (p, _) in self.baselines.items()},
                "ems_fuel": self.plant.totals.fuel_l,
            }
            self.records.append(rec)
            self.i += 1
            self.version += 1
            rec["step_s"] = time.perf_counter() - t_start
            return rec

    def run(self, n: int | None = None, progress: Callable[[int, int], None] | None = None) -> list[dict]:
        target = self.end if n is None else min(self.end, self.i + n)
        total = target - self.i
        out = []
        while self.i < target:
            out.append(self.step())
            if progress:
                progress(len(out), total)
        return out

    # ---------------------------------------------------------------- outputs
    def kpis(self) -> dict:
        fc = self.cfg.econ.fuel_cost_per_l
        out = {"ems": self.plant.totals.to_dict(fc)}
        for name, (p, _) in self.baselines.items():
            out[name] = p.totals.to_dict(fc)
        e = out["ems"]["fuel_l"]
        for name in self.baselines:
            b = out[name]["fuel_l"]
            out[name]["ems_fuel_saving_pct"] = 100.0 * (1 - e / b) if b > 1e-9 else 0.0
        return out

    def sun_status(self) -> dict:
        day = pd.date_range(self.now.normalize(), periods=24, freq="h")
        el = astro_frame(day, self.cfg.site)["sun_elev"].to_numpy()
        if el.min() > 0:
            state = "midnight sun"
        elif el.max() <= 0:
            state = "polar night"
        else:
            state = "day/night cycle"
        return {"state": state, "max_elev": float(el.max()), "min_elev": float(el.min()),
                "hourly": [round(float(x), 1) for x in el]}

    def snapshot(self, hist_hours: int = 48) -> dict:
        with self.lock:
            recs = self.records[-hist_hours:]
            cfg, dec, e = self.cfg, self.last_decision, self.ems
            last = self.records[-1] if self.records else None
            hist = {
                k: [round(float(r[k]), 2) if not isinstance(r[k], (list, bool, str)) else r[k] for r in recs]
                for k in ("ts", "pv", "wind", "load", "batt_kw", "soc", "curtailed", "shed", "fuel_l", "fc_pv", "fc_wind", "fc_load", "temp", "sun_elev")
            }
            hist["gen_kw"] = [[round(r["gen_kw"][g], 1) for r in recs] for g in range(len(cfg.generators))]
            hist["ems_fuel"] = [round(r["ems_fuel"], 1) for r in recs]
            for n in self.baselines:
                hist[n + "_fuel"] = [round(r["base_fuel"][n], 1) for r in recs]
            fc = None
            if dec is not None:
                d = dec.forecast
                fc = {"ts": [t.isoformat() for t in d.index]}
                for c in d.columns:
                    fc[c] = [round(float(x), 1) for x in d[c]]
            return {
                "scenario": self.scenario, "description": SCENARIOS[self.scenario]["desc"],
                "site": {"name": cfg.site.name, "lat": cfg.site.lat, "lon": cfg.site.lon},
                "sim": {"step": self.i - WARMUP, "total": self.end - WARMUP, "done": self.done, "now": self.now.isoformat()},
                "assets": {
                    "pv_kwp": cfg.pv.kwp, "wind_kw": cfg.wind.rated_kw, "battery_kwh": cfg.battery.capacity_kwh,
                    "battery_kw": cfg.battery.max_kw, "gens": [{"name": g.name, "rated_kw": g.rated_kw} for g in cfg.generators],
                    "soc_min": cfg.battery.soc_min, "soc_max": cfg.battery.soc_max,
                },
                "now": last,
                "link": {"up": self.link_up, "nwp_age_h": e.nwp_age_h(self.now), "outbox": e.store.outbox_size(),
                         "synced": len(self.remote)},
                "decision": None if dec is None else {
                    "mode": dec.forecast_mode, "safe": dec.safe_mode, "notes": dec.notes, "overrides": {cfg.generators[k].name: v for k, v in e.overrides.items()},
                    "solve_s": None if dec.plan is None else round(dec.plan.solve_s, 3),
                    "status": "SAFE MODE" if dec.plan is None else dec.plan.status,
                },
                "plan": None if dec is None or dec.plan is None else dec.plan.to_dict(),
                "forecast": fc,
                "history": hist,
                "alerts": {"active": e.alerts.active_list(), "log": [a.to_dict() for a in e.alerts.history[-12:]]},
                "kpis": self.kpis(),
                "sun": self.sun_status(),
                "derate": dict(e.detector.derate),
            }


def default_sink_path() -> Path:
    return Path("data") / "remote_sync.jsonl"
