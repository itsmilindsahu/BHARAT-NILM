"""Station configuration.

Every physical and economic parameter lives here so the same code can be pointed at a
real station by editing ``config/station.yaml`` -- nothing else needs to change.

Units: kW, kWh, degC, m/s, litres, USD (the currency is only a label; use any unit).
"""
from __future__ import annotations

import dataclasses as dc
from pathlib import Path
from typing import Any

import yaml


@dc.dataclass
class SiteConfig:
    name: str = "Polar research station (simulated)"
    lat: float = -70.77  # degrees, south negative (Maitri-class coastal site)
    lon: float = 11.73


@dc.dataclass
class PVConfig:
    kwp: float = 150.0
    inverter_kw: float = 140.0
    perf_ratio: float = 0.86
    temp_coeff: float = -0.004  # per degC of cell temperature
    albedo_gain: float = 0.10  # snow-reflected gain on tilted arrays


@dc.dataclass
class WindConfig:
    rated_kw: float = 100.0
    cut_in: float = 3.0
    rated_speed: float = 12.0
    cut_out: float = 25.0


@dc.dataclass
class BatteryConfig:
    capacity_kwh: float = 600.0
    max_kw: float = 150.0
    eff_charge: float = 0.96
    eff_discharge: float = 0.96
    soc_min: float = 0.20
    soc_max: float = 0.95
    soc_init: float = 0.60
    wear_cost_per_kwh: float = 0.03  # degradation cost per kWh of throughput


@dc.dataclass
class GeneratorConfig:
    name: str = "DG1"
    rated_kw: float = 120.0
    min_load_frac: float = 0.30
    fuel_a: float = 0.08145  # L/h per kW rated  (no-load term of the Willans line)
    fuel_b: float = 0.246  # L/kWh            (marginal term)
    startup_cost: float = 8.0  # wear + start fuel, USD per start
    min_up_h: int = 2
    min_down_h: int = 1
    om_cost_per_kwh: float = 0.02

    @property
    def min_kw(self) -> float:
        return self.rated_kw * self.min_load_frac

    def fuel_lph(self, kw: float, on: bool = True) -> float:
        """Fuel flow (L/h) at a given output. Linear Willans-line model."""
        return (self.fuel_a * self.rated_kw + self.fuel_b * kw) if on else 0.0


@dc.dataclass
class LoadConfig:
    base_kw: float = 50.0  # life support, comms, labs -- always on
    occupancy_kw_summer: float = 32.0  # extra load when the summer crew is in station
    occupancy_kw_winter: float = 8.0  # wintering crew only
    heating_kw_per_c: float = 2.0  # kW per degC below the setpoint
    heating_setpoint_c: float = 15.0
    critical_frac: float = 0.60  # share of load that may never be shed
    noise: float = 0.04


@dc.dataclass
class EconomicsConfig:
    fuel_cost_per_l: float = 3.0  # delivered polar diesel is expensive
    co2_kg_per_l: float = 2.68
    co2_cost_per_kg: float = 0.0  # secondary objective, off by default
    shed_penalty_per_kwh: float = 5.0
    unserved_penalty_per_kwh: float = 50.0
    curtail_penalty_per_kwh: float = 0.005
    reserve_penalty_per_kw: float = 0.5
    dump_penalty_per_kwh: float = 0.02


@dc.dataclass
class OptimizerConfig:
    horizon_h: int = 24
    reserve_load_frac: float = 0.10  # spinning reserve as a share of load ...
    reserve_res_frac: float = 0.20  # ... plus a share of forecast renewable output
    terminal_min_soc_frac: float = 0.30  # battery must not end the horizon below this
    terminal_value_per_kwh: float = 0.35  # credit for energy left in the battery
    robust_weight: float = 0.5  # 0 = trust mean forecast, 1 = plan on p10/p90 bounds
    time_limit_s: float = 2.5
    mip_gap: float = 0.01  # stop when provably within 1 % of the optimum
    solver: str = "SCIP"  # SCIP | CBC (both bundled with OR-Tools)


@dc.dataclass
class ForecastConfig:
    nwp_max_age_h: float = 12.0  # older weather forecasts are treated as unavailable
    train_days: int = 365
    valid_days: int = 30  # per held-out season
    n_estimators: int = 250
    max_depth: int = 5
    learning_rate: float = 0.06
    reps_per_hour: int = 3  # sampled (issue, horizon) pairs per target hour
    model_dir: str = "models"


@dc.dataclass
class StationConfig:
    site: SiteConfig = dc.field(default_factory=SiteConfig)
    pv: PVConfig = dc.field(default_factory=PVConfig)
    wind: WindConfig = dc.field(default_factory=WindConfig)
    battery: BatteryConfig = dc.field(default_factory=BatteryConfig)
    generators: list[GeneratorConfig] = dc.field(
        default_factory=lambda: [GeneratorConfig(name="DG1"), GeneratorConfig(name="DG2")]
    )
    load: LoadConfig = dc.field(default_factory=LoadConfig)
    econ: EconomicsConfig = dc.field(default_factory=EconomicsConfig)
    opt: OptimizerConfig = dc.field(default_factory=OptimizerConfig)
    forecast: ForecastConfig = dc.field(default_factory=ForecastConfig)

    def to_dict(self) -> dict[str, Any]:
        return dc.asdict(self)


def _merge(obj: Any, data: dict[str, Any]) -> None:
    """Recursively overlay ``data`` on a dataclass instance, rejecting unknown keys."""
    fields = {f.name: f for f in dc.fields(obj)}
    for key, value in data.items():
        if key not in fields:
            raise KeyError(f"Unknown config key '{key}' for {type(obj).__name__}")
        current = getattr(obj, key)
        if key == "generators":
            setattr(obj, key, [_from_dict(GeneratorConfig, g) for g in value])
        elif dc.is_dataclass(current) and isinstance(value, dict):
            _merge(current, value)
        else:
            setattr(obj, key, value)


def _from_dict(cls: type, data: dict[str, Any]):
    inst = cls()
    _merge(inst, data)
    return inst


def load_config(path: str | Path | None = None) -> StationConfig:
    """Load defaults, optionally overlaid with a YAML file."""
    cfg = StationConfig()
    if path is not None:
        with open(path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
        _merge(cfg, data)
    return cfg
