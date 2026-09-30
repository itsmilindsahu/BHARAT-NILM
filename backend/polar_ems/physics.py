"""Small physical models shared by the simulator, the anomaly detector and the forecaster.

In a real deployment the PV and wind parameters come from commissioning data or a fit on
history; here they come from ``StationConfig``.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import PVConfig, SiteConfig, WindConfig


def solar_geometry(index: pd.DatetimeIndex, site: SiteConfig) -> tuple[np.ndarray, np.ndarray]:
    """Solar elevation (deg) and clear-sky GHI (W/m2, Haurwitz model) at the middle of each hour.

    ``index`` is naive UTC. At -70.8 deg latitude this reproduces the polar day (sun never
    sets around the December solstice) and polar night (sun never rises around June).
    """
    doy = np.asarray(index.dayofyear, dtype=float)
    hour = np.asarray(index.hour, dtype=float) + 0.5
    decl = np.radians(23.44) * np.sin(2 * np.pi * (284 + doy) / 365.0)
    solar_time = hour + site.lon / 15.0
    hour_angle = np.radians(15.0 * (solar_time - 12.0))
    lat = np.radians(site.lat)
    sin_el = np.sin(lat) * np.sin(decl) + np.cos(lat) * np.cos(decl) * np.cos(hour_angle)
    sin_el = np.clip(sin_el, -1.0, 1.0)
    elev = np.degrees(np.arcsin(sin_el))
    cosz = np.where(sin_el > 0.02, sin_el, np.nan)
    ghi = np.where(np.isnan(cosz), 0.0, 1098.0 * cosz * np.exp(-0.057 / cosz))
    return elev, ghi


def astro_frame(index: pd.DatetimeIndex, site: SiteConfig) -> pd.DataFrame:
    """Everything about a timestamp that is known in advance (needs no network)."""
    elev, cs = solar_geometry(index, site)
    return pd.DataFrame(
        {
            "sun_elev": elev,
            "clearsky_ghi": cs,
            "hod": np.asarray(index.hour, dtype=float),
            "doy": np.asarray(index.dayofyear, dtype=float),
            "dow": np.asarray(index.dayofweek, dtype=float),
        },
        index=index,
    )


def pv_power(ghi, temp, pv: PVConfig):
    """AC power (kW) of the PV plant from GHI (W/m2) and ambient temperature (degC)."""
    ghi = np.asarray(ghi, dtype=float)
    temp = np.asarray(temp, dtype=float)
    plane = ghi * (1.0 + pv.albedo_gain)
    tcell = temp + 0.025 * ghi
    pr = pv.perf_ratio * (1.0 + pv.temp_coeff * (tcell - 25.0))
    return np.clip(pv.kwp * plane / 1000.0 * pr, 0.0, pv.inverter_kw)


def wind_power(speed, w: WindConfig):
    """Wind plant output (kW) from hub-height wind speed (m/s): cubic ramp between cut-in and rated."""
    v = np.asarray(speed, dtype=float)
    ramp = (v**3 - w.cut_in**3) / (w.rated_speed**3 - w.cut_in**3)
    p = np.where(v < w.cut_in, 0.0, np.where(v < w.rated_speed, ramp, 1.0))
    p = np.where(v >= w.cut_out, 0.0, p)
    return w.rated_kw * np.clip(p, 0.0, 1.0)
