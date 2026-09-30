"""Synthetic polar-station world.

The hackathon demo has no live Antarctic feed, so this module produces a physically
plausible stand-in: polar day/night solar geometry, katabatic wind storms, cold snaps,
station demand that tracks temperature and crew size, and an *imperfect* numerical
weather prediction (NWP) with persistent errors.

It is deliberately separated from the EMS: the EMS only ever sees the same interface a
real station would give it (measured telemetry + a weather-forecast feed). To run on real
data, replace ``World`` with a loader that yields the same columns (see README).
"""
from __future__ import annotations

import dataclasses as dc

import numpy as np
import pandas as pd
from scipy.signal import lfilter

from .config import StationConfig
from .physics import astro_frame, pv_power, wind_power

NWP_COLS = ["fc_cloud", "fc_temp", "fc_wind"]
ASTRO_COLS = ["sun_elev", "clearsky_ghi", "hod", "doy", "dow"]


def _ar1(n: int, phi: float, std: float, rng: np.random.Generator) -> np.ndarray:
    """AR(1) noise with the requested *stationary* standard deviation."""
    eps = rng.normal(0.0, std * np.sqrt(1.0 - phi**2), n)
    return lfilter([1.0], [1.0, -phi], eps)


class World:
    """Fault-free ground truth for a station, plus the NWP forecast columns."""

    def __init__(self, cfg: StationConfig, start: str | pd.Timestamp, hours: int, seed: int = 0):
        self.cfg = cfg
        self.seed = seed
        rng = np.random.default_rng(seed)
        idx = pd.date_range(pd.Timestamp(start), periods=hours, freq="h")
        df = astro_frame(idx, cfg.site)
        n = len(idx)
        doy = df["doy"].to_numpy()
        # austral seasonality: 1.0 at mid-January, 0.0 at mid-July
        summer = 0.5 + 0.5 * np.cos(2 * np.pi * (doy - 15) / 365.0)

        # --- cloud cover (logistic transform of a slow AR(1)) ---
        z = 0.4 + _ar1(n, 0.94, 1.3, rng)
        cloud = 1.0 / (1.0 + np.exp(-z))

        # --- temperature: seasonal + diurnal + synoptic noise ---
        t_mean = -10.0 + 9.0 * np.cos(2 * np.pi * (doy - 15) / 365.0)
        diurnal = 2.5 * summer * np.sin(2 * np.pi * (df["hod"].to_numpy() - 9.0) / 24.0)
        temp = t_mean + diurnal + _ar1(n, 0.98, 3.5, rng)

        # --- wind: slow log-normal background + storm events ---
        wind = np.exp(np.log(5.4) + _ar1(n, 0.97, 0.45, rng))
        n_storms = rng.poisson(n / 24.0 / 6.0)
        t_axis = np.arange(n)
        for _ in range(n_storms):
            centre = rng.uniform(0, n)
            width = rng.uniform(6.0, 20.0)
            amp = rng.uniform(6.0, 14.0)
            wind = wind + amp * np.exp(-0.5 * ((t_axis - centre) / width) ** 2)
        wind = np.clip(wind + rng.normal(0, 0.4, n), 0.0, 35.0)

        # --- demand drivers ---
        local_h = (df["hod"].to_numpy() + cfg.site.lon / 15.0) % 24.0
        diurnal_occ = 0.35 + 0.65 * np.clip(np.sin(np.pi * (local_h - 6.0) / 14.0), 0.0, 1.0)
        weekend = np.where(df["dow"].to_numpy() >= 6, 0.7, 1.0)
        occ_kw = (
            cfg.load.occupancy_kw_winter
            + (cfg.load.occupancy_kw_summer - cfg.load.occupancy_kw_winter) * summer
        )
        df["occupancy_kw"] = occ_kw * diurnal_occ * weekend

        df["cloud"] = cloud
        df["temp"] = temp
        df["wind_speed"] = wind
        df["pv_noise"] = rng.normal(0.0, 0.02, n)
        df["wind_noise"] = rng.normal(0.0, 0.03, n)
        df["load_noise"] = rng.normal(0.0, cfg.load.noise, n)

        # --- imperfect NWP: errors are persistent (AR(1)), not white ---
        df["fc_cloud"] = np.clip(cloud + _ar1(n, 0.92, 0.16, rng), 0.0, 1.0)
        df["fc_temp"] = temp + _ar1(n, 0.95, 1.6, rng)
        df["fc_wind"] = np.clip(wind * np.exp(_ar1(n, 0.93, 0.20, rng)), 0.0, None)

        self.df = df
        self._derive()

    # ------------------------------------------------------------------ physics
    def _derive(self) -> None:
        cfg, d = self.cfg, self.df
        d["ghi"] = d["clearsky_ghi"] * (1.0 - 0.75 * d["cloud"] ** 3.4)  # Kasten-Czeplak
        d["pv_kw"] = np.clip(pv_power(d["ghi"], d["temp"], cfg.pv) * (1.0 + d["pv_noise"]), 0, None)
        icing = (d["temp"] > -8.0) & (d["temp"] < 0.0) & (d["cloud"] > 0.7)  # rime-icing regime
        d["wind_kw"] = np.clip(
            wind_power(d["wind_speed"], cfg.wind) * np.where(icing, 0.75, 1.0) * (1.0 + d["wind_noise"]),
            0,
            cfg.wind.rated_kw,
        )
        heating = (
            cfg.load.heating_kw_per_c
            * np.clip(cfg.load.heating_setpoint_c - d["temp"], 0.0, None)
            * (1.0 + 0.02 * d["wind_speed"])  # wind-chill on the building envelope
        )
        d["load_kw"] = np.clip(
            (cfg.load.base_kw + d["occupancy_kw"] + heating) * (1.0 + d["load_noise"]), 5.0, None
        )

    # ------------------------------------------------------------------ events
    def add_cold_snap(self, start_idx: int, hours: int, delta_c: float, forecast_skill: float = 0.6) -> None:
        """Cool the station by ``delta_c`` (negative) over a smooth window.

        The NWP only captures ``forecast_skill`` of the event, so the EMS has to cope with
        a partly-unforeseen load surge.
        """
        n = len(self.df)
        end = min(n, start_idx + hours)
        if start_idx >= n or end <= start_idx:
            return
        w = np.sin(np.linspace(0, np.pi, end - start_idx)) ** 2
        col_t = self.df.columns.get_loc("temp")
        col_f = self.df.columns.get_loc("fc_temp")
        self.df.iloc[start_idx:end, col_t] += delta_c * w
        self.df.iloc[start_idx:end, col_f] += delta_c * forecast_skill * w
        self._derive()

    def frame(self) -> pd.DataFrame:
        return self.df


# ---------------------------------------------------------------------------- faults
FAULT_KINDS = ("pv_fault", "ghi_spike", "wind_flatline", "gen_fuel_leak")


@dc.dataclass
class Fault:
    kind: str  # one of FAULT_KINDS
    start: int  # step index at which the fault begins
    hours: int
    magnitude: float = 1.0  # pv_fault: output multiplier; ghi_spike: sensor multiplier; gen_fuel_leak: fuel multiplier
    target: int = 0  # generator index for gen_fuel_leak

    def active(self, i: int) -> bool:
        return self.start <= i < self.start + self.hours


class FaultInjector:
    """Applies faults at run time so the same mechanism serves scripted scenarios and the dashboard buttons."""

    def __init__(self, faults: list[Fault] | None = None):
        self.faults: list[Fault] = list(faults or [])
        self._held_wind: dict[int, float] = {}

    def add(self, fault: Fault) -> None:
        if fault.kind not in FAULT_KINDS:
            raise ValueError(f"unknown fault kind {fault.kind!r}; choose from {FAULT_KINDS}")
        self.faults.append(fault)

    def active(self, i: int) -> list[Fault]:
        return [f for f in self.faults if f.active(i)]

    def apply(self, i: int, actual: dict[str, float]) -> tuple[dict[str, float], dict[str, float], list[str]]:
        """Return (physical values, measured values, active fault labels) for step ``i``.

        *Physical* changes alter what the plant really produces (a failing PV string);
        *measured* changes only corrupt what the sensors report (a glitching pyranometer).
        """
        physical = dict(actual)
        measured = {
            "pv_kw": actual["pv_kw"],
            "wind_kw": actual["wind_kw"],
            "load_kw": actual["load_kw"],
            "ghi": actual["ghi"],
            "temp": actual["temp"],
            "wind_speed": actual["wind_speed"],
        }
        labels: list[str] = []
        for k, f in enumerate(self.faults):
            if not f.active(i):
                continue
            labels.append(f.kind)
            if f.kind == "pv_fault":
                physical["pv_kw"] *= f.magnitude
                measured["pv_kw"] = physical["pv_kw"]
            elif f.kind == "ghi_spike":
                measured["ghi"] = actual["ghi"] * f.magnitude + 150.0
            elif f.kind == "wind_flatline":
                self._held_wind.setdefault(k, actual["wind_speed"])
                measured["wind_speed"] = self._held_wind[k]
        return physical, measured, labels

    def fuel_multipliers(self, i: int, n_gen: int) -> list[float]:
        mult = [1.0] * n_gen
        for f in self.active(i):
            if f.kind == "gen_fuel_leak" and 0 <= f.target < n_gen:
                mult[f.target] = f.magnitude
        return mult
