"""Physical plant + the fast real-time layer that sits below the EMS.

The EMS plans hourly; the site controller balances the grid every second. This module plays
the controller: given the EMS setpoints and what the weather/demand *actually* did, it
decides what each device really does. Forecast errors are absorbed like this:

1. generators hold their scheduled output (they are slow, and starting/stopping costs fuel);
2. the grid-forming battery absorbs the mismatch, within its power and SOC limits;
3. if the battery cannot, committed generators move up to their rating;
4. if that is not enough, an idle generator is emergency-started;
5. then non-critical load is shed, and only as a last resort is critical load unserved;
6. surplus goes to the battery, then curtails renewables, and finally a dump heater.

The same ``Plant`` executes the EMS and the baseline controllers, so comparisons are
apples-to-apples.
"""
from __future__ import annotations

import dataclasses as dc

import numpy as np

from .config import StationConfig
from .optimizer import Dispatch


@dc.dataclass
class StepResult:
    gen_on: list[bool]
    gen_kw: list[float]
    fuel_lph: list[float]  # per generator, already including any fuel fault
    batt_kw: float  # +discharge / -charge
    soc_kwh: float
    pv_used: float
    wind_used: float
    curtailed: float
    shed: float
    unserved: float
    dump: float
    load: float
    started: list[bool]

    @property
    def fuel_l(self) -> float:
        return float(sum(self.fuel_lph))

    def to_dict(self) -> dict:
        return dc.asdict(self) | {"fuel_l": self.fuel_l}


@dc.dataclass
class Totals:
    fuel_l: float = 0.0
    gen_hours: float = 0.0
    starts: int = 0
    co2_kg: float = 0.0
    shed_kwh: float = 0.0
    unserved_kwh: float = 0.0
    curtailed_kwh: float = 0.0
    load_kwh: float = 0.0
    renewable_kwh: float = 0.0
    hours: int = 0
    emergency_starts: int = 0

    def to_dict(self, fuel_cost_per_l: float = 0.0) -> dict:
        d = dc.asdict(self)
        d["renewable_fraction"] = self.renewable_kwh / self.load_kwh if self.load_kwh else 0.0
        d["fuel_cost"] = self.fuel_l * fuel_cost_per_l
        return d


class Plant:
    def __init__(self, cfg: StationConfig):
        self.cfg = cfg
        n = len(cfg.generators)
        self.soc_kwh = cfg.battery.soc_init * cfg.battery.capacity_kwh
        self.gen_on = [False] * n
        self.gen_hours_in_state = [12] * n
        self.fuel_fault = [1.0] * n
        self.totals = Totals()

    # ------------------------------------------------------------------ state
    def copy_state_for_optimizer(self):
        from .optimizer import PlantState

        return PlantState(self.soc_kwh, list(self.gen_on), list(self.gen_hours_in_state))

    def soc_frac(self) -> float:
        return self.soc_kwh / self.cfg.battery.capacity_kwh

    def _batt_limits(self) -> tuple[float, float]:
        b = self.cfg.battery
        lo, hi = b.soc_min * b.capacity_kwh, b.soc_max * b.capacity_kwh
        max_dis = max(0.0, min(b.max_kw, (self.soc_kwh - lo) * b.eff_discharge))
        max_ch = max(0.0, min(b.max_kw, (hi - self.soc_kwh) / b.eff_charge))
        return max_dis, max_ch

    # ------------------------------------------------------------------- step
    def step(self, d: Dispatch, act: dict[str, float]) -> StepResult:
        """Advance one hour. ``act`` holds the *physical* pv_kw, wind_kw, load_kw."""
        cfg, gens, b = self.cfg, self.cfg.generators, self.cfg.battery
        on = list(d.gen_on)
        g = [min(max(d.gen_kw[i], gens[i].min_kw), gens[i].rated_kw) if on[i] else 0.0 for i in range(len(gens))]
        emergency = [False] * len(gens)

        pv, wind, load = act["pv_kw"], act["wind_kw"], act["load_kw"]
        crit = load * cfg.load.critical_frac
        max_dis, max_ch = self._batt_limits()
        dis = ch = shed = unserved = curtail = dump = 0.0

        need = load - pv - wind - sum(g)  # >0: deficit, <0: surplus
        if need > 1e-9:
            dis = min(need, max_dis)
            need -= dis
            for i in range(len(gens)):  # 3) committed units move up
                if need <= 1e-9:
                    break
                if on[i]:
                    add = min(need, gens[i].rated_kw - g[i])
                    g[i] += add
                    need -= add
            for i in range(len(gens)):  # 4) emergency start
                if need <= 1e-9:
                    break
                if not on[i]:
                    out = min(gens[i].rated_kw, max(gens[i].min_kw, need))
                    on[i], g[i], emergency[i] = True, out, True
                    need -= out
            if need > 1e-9:  # 5) shed non-critical, then (last resort) critical
                shed = min(need, load - crit)
                need -= shed
            if need > 1e-9:
                unserved = need
                need = 0.0

        if need < -1e-9:  # surplus (from the start, or from an emergency-start overshoot)
            surplus = -need
            red = min(dis, surplus)  # first, discharge less
            dis -= red
            surplus -= red
            ch = min(surplus, max_ch)
            surplus -= ch
            curtail = min(surplus, pv + wind)
            surplus -= curtail
            if surplus > 1e-9:  # generators pinned at minimum load with nowhere to send the power
                dump = surplus

        # bookkeeping ---------------------------------------------------------
        self.soc_kwh += ch * b.eff_charge - dis / b.eff_discharge
        self.soc_kwh = float(np.clip(self.soc_kwh, 0.0, b.capacity_kwh))
        pv_used_frac = 1.0 - (curtail / (pv + wind) if pv + wind > 1e-9 else 0.0)
        pv_used, wind_used = pv * pv_used_frac, wind * pv_used_frac

        fuel = [gens[i].fuel_lph(g[i], on[i]) * self.fuel_fault[i] for i in range(len(gens))]
        started = [on[i] and not self.gen_on[i] for i in range(len(gens))]
        for i in range(len(gens)):
            if on[i] == self.gen_on[i]:
                self.gen_hours_in_state[i] += 1
            else:
                self.gen_hours_in_state[i] = 1
        self.gen_on = on

        t = self.totals
        t.fuel_l += sum(fuel)
        t.gen_hours += sum(1 for x in on if x)
        t.starts += sum(started)
        t.emergency_starts += sum(emergency[i] and started[i] for i in range(len(gens)))
        t.co2_kg += sum(fuel) * cfg.econ.co2_kg_per_l
        t.shed_kwh += shed
        t.unserved_kwh += unserved
        t.curtailed_kwh += curtail
        t.load_kwh += load
        t.renewable_kwh += pv_used + wind_used
        t.hours += 1
        return StepResult(on, g, fuel, dis - ch, self.soc_kwh, pv_used, wind_used, curtail, shed, unserved, dump, load, started)


# ------------------------------------------------------------------- baselines
class RuleBasedController:
    """Reactive controllers of the kind found at real stations. They see only the *current* hour.

    ``diesel_always_on`` -- one genset runs continuously and follows load; renewables merely
                            offset its fuel (and are curtailed whenever the set is at minimum load).
    ``soc_cycle_charging`` -- battery first; when SOC falls below a low threshold a genset starts
                            at high (efficient) load and runs until SOC recovers. The usual
                            "well-tuned" hybrid controller and the fairer benchmark.
    """

    def __init__(self, cfg: StationConfig, mode: str = "soc_cycle_charging", soc_low: float = 0.35, soc_high: float = 0.85):
        assert mode in ("diesel_always_on", "soc_cycle_charging")
        self.cfg, self.mode, self.soc_low, self.soc_high = cfg, mode, soc_low, soc_high
        self._latched = False

    def dispatch(self, plant: Plant, act: dict[str, float]) -> Dispatch:
        gens = self.cfg.generators
        net = max(0.0, act["load_kw"] - act["pv_kw"] - act["wind_kw"])
        on = [False] * len(gens)
        kw = [0.0] * len(gens)

        if self.mode == "diesel_always_on":
            want = net
            on[0] = True
            if want <= gens[0].rated_kw or len(gens) == 1:
                kw[0] = min(gens[0].rated_kw, max(gens[0].min_kw, want))
            else:
                on[1] = True
                half = want / 2.0
                kw[0], kw[1] = (min(gens[i].rated_kw, max(gens[i].min_kw, half)) for i in (0, 1))
        else:
            soc = plant.soc_frac()
            if soc < self.soc_low:
                self._latched = True
            elif soc >= self.soc_high:
                self._latched = False
            if self._latched:
                on[0] = True
                target = 0.85 * gens[0].rated_kw
                if net > target and len(gens) > 1:
                    on[1] = True
                    half = net / 2.0
                    kw[0], kw[1] = (min(gens[i].rated_kw, max(gens[i].min_kw, half)) for i in (0, 1))
                else:
                    kw[0] = max(target, gens[0].min_kw)
        return Dispatch(on, kw, 0.0, source=self.mode)
