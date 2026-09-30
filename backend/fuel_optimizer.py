"""One-tick diesel/battery unit commitment for a polar research station."""

from dataclasses import dataclass

import numpy as np
from scipy.optimize import linprog


@dataclass
class FuelOptimizer:
    battery_capacity_kwh: float = 720.0
    genset_min_kw: float = 35.0
    genset_max_kw: float = 240.0
    battery_power_limit_kw: float = 180.0
    fuel_reserve_liters: float = 3_000.0
    interval_hours: float = 0.5
    genset_fuel_rate_l_per_kwh: float = 0.22
    genset_idle_fuel_l_per_hour: float = 1.5

    def optimize(
        self,
        load_forecast_kw: float,
        renewable_forecast_kw: float,
        battery_soc: float,
        fuel_level_liters: float,
        is_extreme_event: bool = False,
    ) -> dict:
        """Choose genset commitment and battery action for the next interval.

        The binary genset commitment is enumerated, while each feasible
        commitment is solved as a linear program for diesel and battery power.
        This keeps the endpoint dependency light and gives exact bounds for the
        one-tick decision.
        """
        load_kw = max(0.0, float(load_forecast_kw))
        renewable_kw = max(0.0, float(renewable_forecast_kw))
        soc = float(np.clip(battery_soc, 0.0, 1.0))
        fuel_level = max(0.0, float(fuel_level_liters))
        required_reserve = self.fuel_reserve_liters * (1.25 if is_extreme_event else 1.0)
        available_fuel = max(0.0, fuel_level - required_reserve)
        max_diesel_by_fuel = max(0.0, (available_fuel / self.interval_hours - self.genset_idle_fuel_l_per_hour) / self.genset_fuel_rate_l_per_kwh)
        battery_discharge_limit = min(self.battery_power_limit_kw, soc * self.battery_capacity_kwh / self.interval_hours)
        battery_charge_limit = min(self.battery_power_limit_kw, (1.0 - soc) * self.battery_capacity_kwh / self.interval_hours)
        net_load_kw = load_kw - renewable_kw

        candidates = []
        for genset_on in (0, 1):
            genset_lower = self.genset_min_kw if genset_on else 0.0
            genset_upper = min(self.genset_max_kw, max_diesel_by_fuel) if genset_on else 0.0
            if genset_on and genset_upper < genset_lower:
                continue

            # Variables: diesel output, battery discharge, battery charge.
            objective = [self.genset_fuel_rate_l_per_kwh, 0.0, 0.001]
            bounds = [
                (genset_lower, genset_upper),
                (0.0, battery_discharge_limit),
                (0.0, battery_charge_limit),
            ]
            equality = [[1.0, 1.0, -1.0]]
            equality_rhs = [net_load_kw]
            result = linprog(
                objective,
                A_eq=equality,
                b_eq=equality_rhs,
                bounds=bounds,
                method="highs",
            )
            if result.success:
                diesel_kw, discharge_kw, charge_kw = result.x
                fuel_used = (self.genset_fuel_rate_l_per_kwh * diesel_kw +
                             (self.genset_idle_fuel_l_per_hour if genset_on else 0.0)) * self.interval_hours
                candidates.append({
                    "genset_on": bool(genset_on),
                    "diesel_kw": float(diesel_kw),
                    "battery_discharge_kw": float(discharge_kw),
                    "battery_charge_kw": float(charge_kw),
                    "fuel_used_liters": float(fuel_used),
                    "objective": float(result.fun),
                })

        if not candidates:
            return {
                "status": "infeasible",
                "reason": "Load exceeds renewable, battery, and fuel-constrained genset capacity",
                "load_forecast_kw": round(load_kw, 3),
                "renewable_forecast_kw": round(renewable_kw, 3),
                "battery_soc": round(soc, 4),
                "fuel_level_liters": round(fuel_level, 2),
                "fuel_reserve_liters": round(required_reserve, 2),
                "is_extreme_event": bool(is_extreme_event),
            }

        choice = min(candidates, key=lambda candidate: candidate["objective"])
        next_soc = soc + (choice["battery_charge_kw"] - choice["battery_discharge_kw"]) * self.interval_hours / self.battery_capacity_kwh
        next_fuel = fuel_level - choice["fuel_used_liters"]
        return {
            "status": "optimal",
            "genset_on": choice["genset_on"],
            "diesel_genset_output_kw": round(choice["diesel_kw"], 3),
            "battery_discharge_kw": round(choice["battery_discharge_kw"], 3),
            "battery_charge_kw": round(choice["battery_charge_kw"], 3),
            "fuel_used_liters": round(choice["fuel_used_liters"], 3),
            "projected_battery_soc": round(float(np.clip(next_soc, 0.0, 1.0)), 4),
            "projected_fuel_level_liters": round(max(0.0, next_fuel), 2),
            "fuel_reserve_liters": round(required_reserve, 2),
            "load_forecast_kw": round(load_kw, 3),
            "renewable_forecast_kw": round(renewable_kw, 3),
            "is_extreme_event": bool(is_extreme_event),
        }
