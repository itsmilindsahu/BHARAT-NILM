"""Real-time anomaly detection on the telemetry stream.

Three complementary layers, cheapest and most explainable first:

1. **Sensor integrity** -- physically impossible or frozen readings (an irradiance sensor
   reading more than the clear-sky maximum for that sun angle; a wind-speed sensor that
   stopped changing). These are *data* faults: the EMS repairs the value before it reaches
   the forecaster ("cleaning/filtering" stage of the pipeline).
2. **Physics residuals** -- the plant should behave like its digital twin. PV output far
   below what measured irradiance implies is a real equipment fault; generator fuel burn
   above the Willans line is a real efficiency fault; load far from its forecast is unusual
   consumption. Thresholds are calibrated from normal history with robust statistics (MAD).
3. **Isolation Forest** -- an unsupervised, multivariate catch-all for operating states that
   none of the hand-written rules anticipated. It is advisory (severity ``info``).

Detected equipment faults feed back into planning: a PV fault derates the PV forecast, a
fuel-hungry generator gets a higher fuel-cost coefficient in the optimizer.
"""
from __future__ import annotations

import dataclasses as dc
from collections import deque

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from .config import StationConfig
from .physics import pv_power, wind_power

SEVERITY_ORDER = {"info": 0, "warning": 1, "critical": 2}


@dc.dataclass
class Finding:
    channel: str
    kind: str
    severity: str
    message: str
    value: float | None = None
    expected: float | None = None

    @property
    def key(self) -> str:
        return f"{self.channel}:{self.kind}"


@dc.dataclass
class Alert:
    id: int
    key: str
    channel: str
    kind: str
    severity: str
    message: str
    first_seen: str
    last_seen: str
    count: int = 1
    value: float | None = None
    expected: float | None = None
    active: bool = True
    cleared_at: str | None = None

    def to_dict(self) -> dict:
        return dc.asdict(self)


class AlertManager:
    """Turns per-step findings into alerts with a lifecycle (raised -> updated -> cleared)."""

    def __init__(self, clear_after: int = 3):
        self.clear_after = clear_after
        self.active: dict[str, Alert] = {}
        self.history: list[Alert] = []
        self._quiet: dict[str, int] = {}
        self._next_id = 1

    def update(self, ts: pd.Timestamp, findings: list[Finding]) -> tuple[list[Alert], list[Alert]]:
        stamp = pd.Timestamp(ts).isoformat()
        new, resolved = [], []
        seen = set()
        for f in findings:
            seen.add(f.key)
            self._quiet[f.key] = 0
            if f.key in self.active:
                a = self.active[f.key]
                a.last_seen, a.count, a.value, a.expected, a.message = stamp, a.count + 1, f.value, f.expected, f.message
                if SEVERITY_ORDER[f.severity] > SEVERITY_ORDER[a.severity]:
                    a.severity = f.severity
            else:
                a = Alert(self._next_id, f.key, f.channel, f.kind, f.severity, f.message, stamp, stamp, 1, f.value, f.expected)
                self._next_id += 1
                self.active[f.key] = a
                self.history.append(a)
                new.append(a)
        for key in list(self.active):
            if key in seen:
                continue
            self._quiet[key] = self._quiet.get(key, 0) + 1
            if self._quiet[key] >= self.clear_after:
                a = self.active.pop(key)
                a.active, a.cleared_at = False, stamp
                resolved.append(a)
        return new, resolved

    def active_list(self) -> list[dict]:
        return sorted((a.to_dict() for a in self.active.values()), key=lambda d: (-SEVERITY_ORDER[d["severity"]], d["id"]))


def wind_speed_from_power(kw: float, cfg: StationConfig) -> float:
    """Invert the cubic ramp of the power curve -- used to repair a frozen wind-speed sensor."""
    w = cfg.wind
    frac = float(np.clip(kw / w.rated_kw, 0.0, 1.0))
    if frac <= 0.0:
        return w.cut_in - 0.5
    if frac >= 1.0:
        return w.rated_speed
    return float((w.cut_in**3 + frac * (w.rated_speed**3 - w.cut_in**3)) ** (1.0 / 3.0))


class AnomalyDetector:
    def __init__(self, cfg: StationConfig):
        self.cfg = cfg
        self.iforest: IsolationForest | None = None
        self.pv_thresh = 0.80
        self.wind_thresh = 0.55
        self.load_sigma = 8.0
        self.reset_state()

    # ------------------------------------------------------------------ state
    def reset_state(self) -> None:
        n = len(self.cfg.generators)
        self._pv_low = 0
        self._pv_ok = 0
        self._wind_low = 0
        self._gen_high = [0] * n
        self._gen_ok = [0] * n
        self._wind_hist: deque[float] = deque(maxlen=4)
        self._if_run = 0
        self._kt_last = 0.6
        self.derate = {"pv": 1.0, "wind": 1.0}
        self.gen_fuel_mult = [1.0] * n

    # ---------------------------------------------------------------- fitting
    def fit(self, frame: pd.DataFrame, load_sigma: float | None = None) -> "AnomalyDetector":
        """Calibrate thresholds on *normal* history (a frame with ghi/temp/wind/pv/wind_kw/load columns)."""
        cfg = self.cfg
        pv_exp = pv_power(frame["ghi"], frame["temp"], cfg.pv)
        m = pv_exp > 15.0
        r = (frame["pv_kw"].to_numpy()[m] / pv_exp[m])
        med = float(np.median(r))
        sig = 1.4826 * float(np.median(np.abs(r - med)))
        self.pv_thresh = float(np.clip(med - 8 * sig, 0.60, 0.85))

        w_exp = wind_power(frame["wind_speed"], cfg.wind)
        m = w_exp > 10.0
        r = frame["wind_kw"].to_numpy()[m] / w_exp[m]
        med = float(np.median(r))
        sig = 1.4826 * float(np.median(np.abs(r - med)))
        self.wind_thresh = float(np.clip(med - 5 * sig, 0.40, 0.70))
        if load_sigma is not None:
            self.load_sigma = load_sigma

        X = self._if_matrix(frame)
        self.iforest = IsolationForest(n_estimators=100, contamination=0.003, random_state=0).fit(X)
        return self

    def _if_matrix(self, frame: pd.DataFrame) -> np.ndarray:
        cfg = self.cfg
        cs = frame["clearsky_ghi"].to_numpy()
        kt = np.where(cs > 50, np.clip(frame["ghi"].to_numpy() / np.maximum(cs, 1), 0, 1.3), 0.0)
        pv_exp = pv_power(frame["ghi"], frame["temp"], cfg.pv)
        w_exp = wind_power(frame["wind_speed"], cfg.wind)
        pv_r = np.where(pv_exp > 15, np.clip(frame["pv_kw"].to_numpy() / np.maximum(pv_exp, 1e-6), 0, 1.5), 1.0)
        w_r = np.where(w_exp > 10, np.clip(frame["wind_kw"].to_numpy() / np.maximum(w_exp, 1e-6), 0, 1.5), 1.0)
        return np.column_stack([kt, pv_r, w_r, frame["load_kw"], frame["temp"], frame["wind_speed"]])

    # -------------------------------------------------------------- detection
    def check(
        self,
        m: dict[str, float],
        astro: dict[str, float],
        expected_load: float | None = None,
        gens: list[dict] | None = None,
    ) -> list[Finding]:
        """Inspect one hour of measured telemetry.

        ``m``: pv_kw, wind_kw, load_kw, ghi, temp, wind_speed. ``astro``: sun_elev, clearsky_ghi.
        ``gens``: per generator ``{"on": bool, "kw": float, "fuel_lph": float}``.
        """
        cfg = self.cfg
        out: list[Finding] = []
        cs = astro["clearsky_ghi"]

        # 1) sensor integrity ------------------------------------------------
        ghi_bad = m["ghi"] < -5.0 or m["ghi"] > 1.15 * cs + 60.0
        if ghi_bad:
            out.append(
                Finding("ghi", "sensor_spike", "warning",
                        f"Irradiance sensor reads {m['ghi']:.0f} W/m2 but the sky cannot deliver more than "
                        f"{1.15 * cs + 60:.0f} W/m2 at this sun angle; using last good clearness index.",
                        m["ghi"], cs))
            ghi_used = self._kt_last * cs
        else:
            ghi_used = m["ghi"]
            if cs > 50:
                self._kt_last = float(np.clip(m["ghi"] / cs, 0.05, 1.2))

        self._wind_hist.append(m["wind_speed"])
        flat = len(self._wind_hist) == self._wind_hist.maxlen and (max(self._wind_hist) - min(self._wind_hist)) < 1e-9
        if flat:
            out.append(Finding("wind_speed", "sensor_flatline", "warning",
                               f"Wind-speed sensor frozen at {m['wind_speed']:.1f} m/s for {len(self._wind_hist)}+ h; "
                               "estimating speed from turbine output.", m["wind_speed"], None))
        if not (-80.0 <= m["temp"] <= 25.0):
            out.append(Finding("temp", "out_of_range", "warning", f"Temperature {m['temp']:.1f} degC outside plausible range.", m["temp"], None))

        # 2) physics residuals -------------------------------------------------
        pv_exp = float(pv_power(ghi_used, m["temp"], cfg.pv))
        if pv_exp > 15.0:
            ratio = m["pv_kw"] / pv_exp
            if ratio < self.pv_thresh:
                self._pv_low += 1
                self._pv_ok = 0
                if self._pv_low >= 2 or ratio < 0.3:
                    sev = "critical" if ratio < 0.5 else "warning"
                    out.append(Finding("pv", "underperformance", sev,
                                       f"PV delivers {100 * ratio:.0f}% of what irradiance implies "
                                       f"({m['pv_kw']:.0f} vs {pv_exp:.0f} kW): string/inverter fault or snow cover.",
                                       m["pv_kw"], pv_exp))
                    self.derate["pv"] = float(np.clip(ratio, 0.05, 1.0))
            else:
                self._pv_low = 0
                self._pv_ok += 1
                if self._pv_ok >= 2:
                    self.derate["pv"] = 1.0

        if not flat:
            w_exp = float(wind_power(m["wind_speed"], cfg.wind))
            if w_exp > 10.0:
                ratio = m["wind_kw"] / w_exp
                if ratio < self.wind_thresh:
                    self._wind_low += 1
                    if self._wind_low >= 2:
                        out.append(Finding("wind", "underperformance", "warning",
                                           f"Wind plant at {100 * ratio:.0f}% of its power curve "
                                           f"({m['wind_kw']:.0f} vs {w_exp:.0f} kW): icing, yaw or grid fault.",
                                           m["wind_kw"], w_exp))
                        self.derate["wind"] = float(np.clip(ratio, 0.1, 1.0))
                else:
                    self._wind_low = 0
                    self.derate["wind"] = 1.0

        if expected_load is not None:
            z = (m["load_kw"] - expected_load) / self.load_sigma
            if abs(z) > 4.5:
                out.append(Finding("load", "unexpected_demand", "warning",
                                   f"Load {m['load_kw']:.0f} kW is {z:+.1f} sigma from forecast ({expected_load:.0f} kW): "
                                   "unusual consumption, metering fault or cyber anomaly.", m["load_kw"], expected_load))

        for i, g in enumerate(gens or []):
            if not g["on"] or g["kw"] < 10.0:
                continue
            exp = cfg.generators[i].fuel_lph(g["kw"], True)
            ratio = g["fuel_lph"] / exp
            if ratio > 1.25:
                self._gen_high[i] += 1
                self._gen_ok[i] = 0
                if self._gen_high[i] >= 2:
                    out.append(Finding(f"gen{i + 1}", "fuel_overconsumption", "warning",
                                       f"{cfg.generators[i].name} burns {100 * ratio:.0f}% of expected fuel "
                                       f"({g['fuel_lph']:.1f} vs {exp:.1f} L/h): injector, leak or metering fault.",
                                       g["fuel_lph"], exp))
                    self.gen_fuel_mult[i] = float(np.clip(ratio, 1.0, 2.5))
            else:
                self._gen_high[i] = 0
                self._gen_ok[i] += 1
                if self._gen_ok[i] >= 3:
                    self.gen_fuel_mult[i] = 1.0

        # 3) unsupervised catch-all (advisory) --------------------------------
        if self.iforest is not None:
            row = pd.DataFrame(
                [{"clearsky_ghi": cs, "ghi": ghi_used, "temp": m["temp"], "pv_kw": m["pv_kw"],
                  "wind_speed": m["wind_speed"], "wind_kw": m["wind_kw"], "load_kw": m["load_kw"]}]
            )
            outlier = self.iforest.predict(self._if_matrix(row))[0] == -1
            self._if_run = self._if_run + 1 if outlier else 0
            if self._if_run >= 2 and not out:
                out.append(Finding("system", "unusual_state", "info",
                                   "Operating state is statistically unusual compared with normal history.", None, None))
        return out

    # ----------------------------------------------------------------- repair
    def clean(self, m: dict[str, float], findings: list[Finding], astro: dict[str, float]) -> dict[str, float]:
        """Repair *data* faults so they never reach the forecaster. Equipment faults are left as measured."""
        out = dict(m)
        kinds = {(f.channel, f.kind) for f in findings}
        if ("ghi", "sensor_spike") in kinds:
            out["ghi"] = self._kt_last * astro["clearsky_ghi"]
        if ("wind_speed", "sensor_flatline") in kinds:
            out["wind_speed"] = wind_speed_from_power(m["wind_kw"], self.cfg)
        return out
