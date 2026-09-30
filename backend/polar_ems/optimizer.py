"""Rolling-horizon dispatch optimization (mixed-integer linear program).

Decision variables per hour ``t`` over the horizon:

* generator ``i``: on/off ``u``, start-up ``v``, shut-down ``s`` (binary), output ``g`` (kW)
* battery: charge ``pch``, discharge ``pdis`` (kW). No charge/discharge exclusivity binary is needed:
  round-trip losses, wear cost and a cheap dump load make simultaneous use strictly worse, and
  dropping the 24 binaries tightens the relaxation considerably
* renewables actually used (``pv_used``, ``wind_used`` <= forecast; the rest is curtailed)
* load shed (non-critical only), unserved energy, dump load, reserve shortfall (penalised slacks
  that keep the model feasible whatever the inputs are)

Objective: fuel cost (linear Willans line + start-up cost) + O&M + battery wear + CO2 price +
penalties, minus a credit for energy left in the battery at the end of the horizon.

Constraints: power balance, generator min/max load, min up/down times (including the state
carried in from the past), battery power/energy/SOC limits with efficiencies, terminal SOC
floor, and a spinning-reserve requirement that scales with load and with renewable output
(because renewables are what can drop suddenly).

The MILP is solved with the SCIP (default) or CBC engines bundled in OR-Tools -- no network, no
licence. Benchmarking showed that proving *optimality* is what is slow (the incumbent is found
almost immediately), so a small relative MIP gap (0.5 %) cuts solve times by 10-40x for a
cost difference of a few hundredths of a percent.
"""
from __future__ import annotations

import dataclasses as dc
import time

import numpy as np
import pandas as pd
from ortools.linear_solver import pywraplp

from .config import StationConfig


@dc.dataclass
class PlanningForecast:
    """Values the optimizer plans against (already risk-adjusted / derated by the EMS)."""

    ts: pd.DatetimeIndex
    pv: np.ndarray
    wind: np.ndarray
    load: np.ndarray


@dc.dataclass
class PlantState:
    soc_kwh: float
    gen_on: list[bool]
    gen_hours_in_state: list[int]  # hours since the unit last changed state (>= 1)


@dc.dataclass
class Dispatch:
    """What the EMS sends to the site controller for the coming hour."""

    gen_on: list[bool]
    gen_kw: list[float]
    batt_kw: float  # +discharge / -charge (informational; the controller balances the battery in real time)
    source: str = "optimizer"


@dc.dataclass
class Plan:
    status: str
    ts: pd.DatetimeIndex
    gen_on: np.ndarray  # (G, H)
    gen_kw: np.ndarray  # (G, H)
    batt_kw: np.ndarray  # (H,)  +discharge
    soc_kwh: np.ndarray  # (H+1,)
    pv_used: np.ndarray
    wind_used: np.ndarray
    curtailed: np.ndarray
    shed: np.ndarray
    unserved: np.ndarray
    dump: np.ndarray
    reserve_short: np.ndarray
    fuel_l: np.ndarray
    cost: float
    solve_s: float
    forecast: PlanningForecast

    @property
    def ok(self) -> bool:
        return self.status in ("OPTIMAL", "FEASIBLE")

    def first_step(self) -> Dispatch:
        return Dispatch(
            gen_on=[bool(x) for x in self.gen_on[:, 0]],
            gen_kw=[float(x) for x in self.gen_kw[:, 0]],
            batt_kw=float(self.batt_kw[0]),
        )

    def to_dict(self) -> dict:
        r = lambda a: [round(float(x), 2) for x in a]  # noqa: E731
        return {
            "status": self.status,
            "solve_s": round(self.solve_s, 3),
            "cost": round(self.cost, 2),
            "ts": [t.isoformat() for t in self.ts],
            "gen_kw": [r(row) for row in self.gen_kw],
            "gen_on": [[int(x) for x in row] for row in self.gen_on],
            "batt_kw": r(self.batt_kw),
            "soc_kwh": r(self.soc_kwh),
            "pv_used": r(self.pv_used),
            "wind_used": r(self.wind_used),
            "curtailed": r(self.curtailed),
            "shed": r(self.shed),
            "unserved": r(self.unserved),
            "fuel_l": r(self.fuel_l),
            "load": r(self.forecast.load),
            "pv_fc": r(self.forecast.pv),
            "wind_fc": r(self.forecast.wind),
        }


_STATUS = {
    pywraplp.Solver.OPTIMAL: "OPTIMAL",
    pywraplp.Solver.FEASIBLE: "FEASIBLE",
    pywraplp.Solver.INFEASIBLE: "INFEASIBLE",
    pywraplp.Solver.UNBOUNDED: "UNBOUNDED",
    pywraplp.Solver.ABNORMAL: "ABNORMAL",
    pywraplp.Solver.NOT_SOLVED: "NOT_SOLVED",
}


def solve_dispatch(
    cfg: StationConfig,
    fc: PlanningForecast,
    state: PlantState,
    overrides: dict[int, str] | None = None,
    fuel_mult: list[float] | None = None,
) -> Plan:
    """Solve one horizon.

    ``overrides``: ``{gen_index: "on" | "off"}`` operator commands, forced for the whole horizon.
    ``fuel_mult``: per-generator fuel-burn multipliers (>1 for a unit the anomaly detector flagged).
    """
    t0 = time.perf_counter()
    gens, bat, econ, opt = cfg.generators, cfg.battery, cfg.econ, cfg.opt
    G, H = len(gens), len(fc.load)
    overrides = overrides or {}
    fuel_mult = fuel_mult or [1.0] * G

    solver = pywraplp.Solver.CreateSolver(opt.solver) or pywraplp.Solver.CreateSolver("CBC")
    if solver is None:
        raise RuntimeError("no MILP solver available in this OR-Tools build")
    params = pywraplp.MPSolverParameters()
    params.SetDoubleParam(pywraplp.MPSolverParameters.RELATIVE_MIP_GAP, opt.mip_gap)
    solver.SetTimeLimit(int(opt.time_limit_s * 1000))
    inf = solver.infinity()

    soc_min, soc_max = bat.soc_min * bat.capacity_kwh, bat.soc_max * bat.capacity_kwh
    soc0 = float(np.clip(state.soc_kwh, soc_min, soc_max))

    g = [[solver.NumVar(0, gens[i].rated_kw, f"g{i}_{t}") for t in range(H)] for i in range(G)]
    u = [[solver.BoolVar(f"u{i}_{t}") for t in range(H)] for i in range(G)]
    v = [[solver.BoolVar(f"v{i}_{t}") for t in range(H)] for i in range(G)]  # start-up
    s = [[solver.BoolVar(f"s{i}_{t}") for t in range(H)] for i in range(G)]  # shut-down
    pch = [solver.NumVar(0, bat.max_kw, f"pch{t}") for t in range(H)]
    pdis = [solver.NumVar(0, bat.max_kw, f"pdis{t}") for t in range(H)]
    soc = [solver.NumVar(soc_min, soc_max, f"soc{t}") for t in range(H + 1)]
    pv_u = [solver.NumVar(0, max(0.0, float(fc.pv[t])), f"pv{t}") for t in range(H)]
    wd_u = [solver.NumVar(0, max(0.0, float(fc.wind[t])), f"wd{t}") for t in range(H)]
    shed = [solver.NumVar(0, (1 - cfg.load.critical_frac) * float(fc.load[t]), f"shed{t}") for t in range(H)]
    unserved = [solver.NumVar(0, inf, f"uns{t}") for t in range(H)]
    dump = [solver.NumVar(0, inf, f"dump{t}") for t in range(H)]
    rshort = [solver.NumVar(0, inf, f"rs{t}") for t in range(H)]
    rbat = [solver.NumVar(0, bat.max_kw, f"rb{t}") for t in range(H)]

    solver.Add(soc[0] == soc0)
    for t in range(H):
        # battery
        solver.Add(soc[t + 1] == soc[t] + bat.eff_charge * pch[t] - pdis[t] / bat.eff_discharge)
        # power balance:  generation + renewables + discharge = (load - shed) + charge + dump - unserved
        solver.Add(
            solver.Sum(g[i][t] for i in range(G)) + pv_u[t] + wd_u[t] + pdis[t] + unserved[t]
            == float(fc.load[t]) - shed[t] + pch[t] + dump[t]
        )
        # spinning reserve: unloaded headroom on committed units + what the battery could add
        solver.Add(rbat[t] <= bat.max_kw - pdis[t] + pch[t])
        solver.Add(rbat[t] <= (soc[t] - soc_min) * bat.eff_discharge - pdis[t])
        need = opt.reserve_load_frac * float(fc.load[t])
        solver.Add(
            solver.Sum(gens[i].rated_kw * u[i][t] - g[i][t] for i in range(G)) + rbat[t] + rshort[t]
            >= need + opt.reserve_res_frac * (pv_u[t] + wd_u[t])
        )
        for i in range(G):
            solver.Add(g[i][t] <= gens[i].rated_kw * u[i][t])
            solver.Add(g[i][t] >= gens[i].min_kw * u[i][t])
            prev = 1.0 if state.gen_on[i] else 0.0
            u_prev = u[i][t - 1] if t > 0 else prev
            solver.Add(v[i][t] >= u[i][t] - u_prev)
            solver.Add(s[i][t] >= u_prev - u[i][t])

    # minimum up / down time (incl. history carried in from the plant)
    for i, gc in enumerate(gens):
        for t in range(H):
            lo = max(0, t - gc.min_up_h + 1)
            solver.Add(solver.Sum(v[i][k] for k in range(lo, t + 1)) <= u[i][t])
            lo = max(0, t - gc.min_down_h + 1)
            solver.Add(solver.Sum(s[i][k] for k in range(lo, t + 1)) <= 1 - u[i][t])
        held = state.gen_hours_in_state[i]
        if state.gen_on[i] and held < gc.min_up_h:
            for t in range(min(H, gc.min_up_h - held)):
                solver.Add(u[i][t] == 1)
        if (not state.gen_on[i]) and held < gc.min_down_h:
            for t in range(min(H, gc.min_down_h - held)):
                solver.Add(u[i][t] == 0)
        if overrides.get(i) in ("on", "off"):
            for t in range(H):
                solver.Add(u[i][t] == (1 if overrides[i] == "on" else 0))

    # do not end the horizon with an empty battery; credit whatever is left
    solver.Add(soc[H] >= min(soc0, opt.terminal_min_soc_frac * bat.capacity_kwh))

    fuel_price = econ.fuel_cost_per_l + econ.co2_kg_per_l * econ.co2_cost_per_kg
    terms = []
    for t in range(H):
        for i, gc in enumerate(gens):
            m = fuel_mult[i]
            tie = 1e-3 * i  # breaks the symmetry between identical units (huge speed-up for branch & bound)
            terms.append((fuel_price * m * gc.fuel_a * gc.rated_kw + tie) * u[i][t])
            terms.append((fuel_price * m * gc.fuel_b + gc.om_cost_per_kwh + tie) * g[i][t])
            terms.append(gc.startup_cost * v[i][t])
        terms.append(bat.wear_cost_per_kwh * (pch[t] + pdis[t]))
        terms.append(econ.curtail_penalty_per_kwh * (float(fc.pv[t]) - pv_u[t] + float(fc.wind[t]) - wd_u[t]))
        terms.append(econ.shed_penalty_per_kwh * shed[t])
        terms.append(econ.unserved_penalty_per_kwh * unserved[t])
        terms.append(econ.dump_penalty_per_kwh * dump[t])
        terms.append(econ.reserve_penalty_per_kw * rshort[t])
    terms.append(-opt.terminal_value_per_kwh * soc[H])
    solver.Minimize(solver.Sum(terms))

    status = _STATUS.get(solver.Solve(params), "ERROR")
    solve_s = time.perf_counter() - t0
    if status not in ("OPTIMAL", "FEASIBLE"):
        z = np.zeros(H)
        return Plan(status, fc.ts, np.zeros((G, H)), np.zeros((G, H)), z, np.full(H + 1, soc0), z, z, z, z, z, z, z, z,
                    float("nan"), solve_s, fc)

    val = lambda x: np.array([float(e.solution_value()) for e in x])  # noqa: E731
    gen_on = np.array([[round(u[i][t].solution_value()) for t in range(H)] for i in range(G)], dtype=int)
    gen_kw = np.array([[g[i][t].solution_value() for t in range(H)] for i in range(G)]) * gen_on
    fuel = sum(
        np.array([gens[i].fuel_lph(gen_kw[i][t], bool(gen_on[i][t])) for t in range(H)]) * fuel_mult[i] for i in range(G)
    )
    pv_used, wind_used = val(pv_u), val(wd_u)
    return Plan(
        status=status,
        ts=fc.ts,
        gen_on=gen_on,
        gen_kw=gen_kw,
        batt_kw=val(pdis) - val(pch),
        soc_kwh=val(soc),
        pv_used=pv_used,
        wind_used=wind_used,
        curtailed=np.clip(fc.pv - pv_used, 0, None) + np.clip(fc.wind - wind_used, 0, None),
        shed=val(shed),
        unserved=val(unserved),
        dump=val(dump),
        reserve_short=val(rshort),
        fuel_l=np.asarray(fuel, dtype=float),
        cost=float(solver.Objective().Value()),
        solve_s=solve_s,
        forecast=fc,
    )
