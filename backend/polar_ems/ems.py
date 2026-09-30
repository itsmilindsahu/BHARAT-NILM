"""The Energy Management System: one object that owns the decision cycle.

Each hour the cycle is::

    ingest(telemetry) -> detect anomalies -> clean data -> forecast 24 h -> optimize -> dispatch

and it is *local-first*: nothing in the cycle needs the network. The satellite link is used
only to (a) receive fresh weather forecasts and (b) drain the outbox of logs and alerts. If the
weather forecast is stale the EMS switches to its local-only forecast model; if the solver
fails it falls back to a rule-based safe mode. The station keeps running either way.
"""
from __future__ import annotations

import dataclasses as dc
from collections import deque
from types import SimpleNamespace
from typing import Callable

import numpy as np
import pandas as pd

from .anomaly import Alert, AlertManager, AnomalyDetector, Finding
from .config import StationConfig
from .edge_io import ControllerAdapter, InProcessBus, NullController, TelemetryBus
from .forecasting import HORIZON, MEASURED, ForecastBundle, build_inference_frame
from .optimizer import Dispatch, Plan, PlanningForecast, PlantState, solve_dispatch
from .physics import astro_frame
from .plant import RuleBasedController
from .simulator import ASTRO_COLS, NWP_COLS, World
from .store import Store


@dc.dataclass
class Decision:
    ts: pd.Timestamp
    dispatch: Dispatch
    plan: Plan | None
    forecast: pd.DataFrame  # mean / lo / hi for each target, derates applied
    forecast_mode: str  # "online" | "offline"
    safe_mode: bool  # True when the rule-based fallback produced the dispatch
    notes: list[str]


def make_detector(cfg: StationConfig, bundle: ForecastBundle, seed: int = 42) -> AnomalyDetector:
    """Calibrate the anomaly detector on a year of normal (fault-free) history."""
    normal = World(cfg, "2023-06-01", 24 * 365, seed=seed).frame()
    sigma = float(np.mean([(hi - lo) / 2.563 for lo, hi in bundle.resid_q[("load_kw", "nwp")][:2]]))
    return AnomalyDetector(cfg).fit(normal, load_sigma=sigma)


class EMS:
    def __init__(
        self,
        cfg: StationConfig,
        bundle: ForecastBundle,
        detector: AnomalyDetector,
        store: Store | None = None,
        bus: TelemetryBus | None = None,
        controller: ControllerAdapter | None = None,
    ):
        self.cfg, self.bundle, self.detector = cfg, bundle, detector
        self.store = store or Store(":memory:")
        self.bus = bus or InProcessBus()
        self.controller = controller or NullController()
        self.alerts = AlertManager()
        self.overrides: dict[int, str] = {}
        self._rows: deque[tuple[pd.Timestamp, dict]] = deque(maxlen=200)
        self.nwp: pd.DataFrame | None = None
        self.nwp_issued: pd.Timestamp | None = None
        self._pending_fc: pd.DataFrame | None = None
        self._fallback = RuleBasedController(cfg, "soc_cycle_charging")
        self.last_decision: Decision | None = None
        self._load_nwp_from_store()

    # ---------------------------------------------------------------- history
    def seed_history(self, frame: pd.DataFrame) -> None:
        """Warm start: give the forecaster its first days of measurements."""
        for ts, r in frame.iterrows():
            row = {c: float(r[c]) for c in MEASURED}
            row.update({c: float(r[c]) for c in ASTRO_COLS})
            row.update({c: np.nan for c in NWP_COLS})
            self._rows.append((ts, row))

    def history_frame(self) -> pd.DataFrame:
        idx = [t for t, _ in self._rows]
        return pd.DataFrame([r for _, r in self._rows], index=pd.DatetimeIndex(idx))

    # -------------------------------------------------------------------- nwp
    def receive_nwp(self, frame: pd.DataFrame, issued: pd.Timestamp) -> None:
        """Store a weather forecast delivered over the satellite link (survives restarts)."""
        self.nwp = frame[NWP_COLS].copy()
        self.nwp_issued = pd.Timestamp(issued)
        self.store.kv_set(
            "nwp_cache",
            {"issued": self.nwp_issued.isoformat(), "index": [t.isoformat() for t in self.nwp.index],
             "data": self.nwp.round(4).to_dict(orient="list")},
        )

    def _load_nwp_from_store(self) -> None:
        c = self.store.kv_get("nwp_cache")
        if c:
            self.nwp = pd.DataFrame(c["data"], index=pd.DatetimeIndex(c["index"]))
            self.nwp_issued = pd.Timestamp(c["issued"])

    def nwp_age_h(self, now: pd.Timestamp) -> float | None:
        return None if self.nwp_issued is None else float((now - self.nwp_issued) / pd.Timedelta(hours=1))

    def nwp_usable(self, first_target: pd.Timestamp) -> bool:
        if self.nwp is None or self.nwp_issued is None:
            return False
        age = (first_target - self.nwp_issued) / pd.Timedelta(hours=1)
        last_needed = first_target + pd.Timedelta(hours=HORIZON - 1)
        return age <= self.cfg.forecast.nwp_max_age_h and self.nwp.index.max() >= last_needed

    # ------------------------------------------------------------- operator
    def set_override(self, gen_index: int, mode: str | None) -> None:
        if mode in ("on", "off"):
            self.overrides[gen_index] = mode
        else:
            self.overrides.pop(gen_index, None)

    # ---------------------------------------------------------------- decide
    def decide(self, plant_state: PlantState) -> Decision:
        """Produce the dispatch for the hour that starts right after the last ingested sample."""
        cfg = self.cfg
        hist = self.history_frame()
        first = hist.index[-1] + pd.Timedelta(hours=1)
        notes: list[str] = []

        use_nwp = self.nwp_usable(first)
        mode = "online" if use_nwp else "offline"
        if not use_nwp:
            notes.append("weather forecast unavailable or stale: using local-only forecast model")
        frame, iss = build_inference_frame(hist, HORIZON, cfg.site, self.nwp if use_nwp else None)
        fc = self.bundle.predict(frame, iss, use_nwp=use_nwp)

        # fault-aware derating: plan on what the equipment can really deliver
        for tgt, key in (("pv_kw", "pv"), ("wind_kw", "wind")):
            k = self.detector.derate[key]
            if k < 0.999:
                for col in (tgt, f"{tgt}_lo", f"{tgt}_hi"):
                    fc[col] = fc[col] * k
                notes.append(f"{key} forecast derated to {100 * k:.0f}% after equipment alert")

        w = cfg.opt.robust_weight  # plan between the mean and the pessimistic bound
        planning = PlanningForecast(
            ts=fc.index,
            pv=(fc["pv_kw"] + w * (fc["pv_kw_lo"] - fc["pv_kw"])).clip(lower=0).to_numpy(),
            wind=(fc["wind_kw"] + w * (fc["wind_kw_lo"] - fc["wind_kw"])).clip(lower=0).to_numpy(),
            load=(fc["load_kw"] + w * (fc["load_kw_hi"] - fc["load_kw"])).to_numpy(),
        )

        plan, safe = None, False
        try:
            plan = solve_dispatch(cfg, planning, plant_state, self.overrides, list(self.detector.gen_fuel_mult))
            if not plan.ok:
                notes.append(f"optimizer returned {plan.status}: safe mode")
        except Exception as exc:  # solver crash, licence, memory ... never take the station down
            notes.append(f"optimizer error ({type(exc).__name__}): safe mode")
        if plan is not None and plan.ok:
            dispatch = plan.first_step()
        else:
            safe = True
            dispatch = self._safe_dispatch(plant_state, planning)
            plan = None
        for i, m in self.overrides.items():
            dispatch.gen_on[i] = m == "on"
            if m == "off":
                dispatch.gen_kw[i] = 0.0
            elif dispatch.gen_kw[i] < cfg.generators[i].min_kw:
                dispatch.gen_kw[i] = cfg.generators[i].min_kw
        if self.overrides:
            notes.append("operator override active: " + ", ".join(f"{cfg.generators[i].name}={m}" for i, m in self.overrides.items()))

        if not self.controller.write_setpoints(dispatch):
            self.alerts.update(first, [Finding("controller", "write_failed", "critical",
                                               "Could not write setpoints to the site controller; it holds its last commands.")])
        self._pending_fc = fc
        decision = Decision(first, dispatch, plan, fc, mode, safe, notes)
        self.last_decision = decision
        self._log_decision(decision)
        return decision

    def _safe_dispatch(self, ps: PlantState, planning: PlanningForecast) -> Dispatch:
        view = SimpleNamespace(soc_frac=lambda: ps.soc_kwh / self.cfg.battery.capacity_kwh)
        act = {"pv_kw": planning.pv[0], "wind_kw": planning.wind[0], "load_kw": planning.load[0]}
        return self._fallback.dispatch(view, act)

    # ---------------------------------------------------------------- ingest
    def ingest(self, ts: pd.Timestamp, measured: dict[str, float], gens: list[dict], soc_frac: float) -> tuple[list[Alert], list[Alert]]:
        """Absorb one hour of measured telemetry: detect anomalies, repair data faults, remember."""
        astro = astro_frame(pd.DatetimeIndex([ts]), self.cfg.site).iloc[0].to_dict()
        expected_load = None
        if self._pending_fc is not None and ts in self._pending_fc.index:
            expected_load = float(self._pending_fc.loc[ts, "load_kw"])
        findings = self.detector.check(measured, astro, expected_load, gens)
        new, resolved = self.alerts.update(ts, findings)
        cleaned = self.detector.clean(measured, findings, astro)

        # model inputs describe a *healthy* plant; equipment faults are handled by explicit derates
        for col, key in (("pv_kw", "pv"), ("wind_kw", "wind")):
            k = self.detector.derate[key]
            if k < 0.999:
                cleaned[col] = cleaned[col] / max(k, 0.05)
        row = {c: float(cleaned[c]) for c in MEASURED}
        row.update({c: float(astro[c]) for c in ASTRO_COLS})
        row.update({c: np.nan for c in NWP_COLS})
        self._rows.append((ts, row))

        stamp = pd.Timestamp(ts).isoformat()
        raw = {"ts": stamp, **{k: round(float(v), 2) for k, v in measured.items()}, "soc": round(soc_frac, 4),
               "gens": gens}
        self.store.log_telemetry(stamp, raw)
        for a in new:
            self.store.log_alert(stamp, a.to_dict())
            self.store.outbox_put("alert", {"event": "raised", **a.to_dict()})
        for a in resolved:
            self.store.outbox_put("alert", {"event": "cleared", **a.to_dict()})
        self.store.outbox_put("telemetry", raw)
        self.bus.publish("telemetry", raw)
        for a in new:
            self.bus.publish("alerts", a.to_dict())
        return new, resolved

    def _log_decision(self, d: Decision) -> None:
        payload = {
            "ts": d.ts.isoformat(),
            "forecast_mode": d.forecast_mode,
            "safe_mode": d.safe_mode,
            "gen_on": d.dispatch.gen_on,
            "gen_kw": [round(x, 1) for x in d.dispatch.gen_kw],
            "solver": None if d.plan is None else {"status": d.plan.status, "solve_s": round(d.plan.solve_s, 3)},
            "notes": d.notes,
        }
        self.store.log_decision(d.ts.isoformat(), payload)
        self.bus.publish("decision", payload)

    # ------------------------------------------------------------------ sync
    def sync(self, link_up: bool, sink: Callable[[str, dict], None]) -> int:
        return self.store.sync(link_up, sink)
