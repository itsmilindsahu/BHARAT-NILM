"""24-hour forecasts of PV output, wind output and station load.

Design notes
------------
* One model per target and per *variant*:
    - ``nwp``   : uses the satellite-delivered weather forecast (cloud, temperature, wind)
    - ``local`` : uses only astronomy and local history -- the **offline fallback** that keeps
                  the EMS running when the link is down and the cached forecast has expired.
* A single model serves every lead time h = 1..24 (``h`` is a feature). Training rows are
  sampled (issue time, horizon) pairs, so the model sees exactly the information it will
  have at run time: measurements up to the issue time, and *known-in-advance* inputs
  (astronomy, NWP) for the target hour. Nothing measured after the issue time is used.
* Uncertainty: empirical residual quantiles per horizon bucket, measured on held-out data,
  give p10/p90 bands that the optimizer can plan against.
"""
from __future__ import annotations

import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from .config import ForecastConfig, SiteConfig, StationConfig
from .physics import astro_frame
from .simulator import ASTRO_COLS, NWP_COLS, World

TARGETS = ("pv_kw", "wind_kw", "load_kw")
MEASURED = ["pv_kw", "wind_kw", "load_kw", "ghi", "temp", "wind_speed"]
HORIZON = 24
_BUCKETS = np.array([3, 8, 16, 24])  # upper edges of horizon buckets (hours)


# --------------------------------------------------------------------------- features
def _arrays(frame: pd.DataFrame) -> dict[str, np.ndarray]:
    A = {c: frame[c].to_numpy(dtype=float) for c in frame.columns}
    cs = A["clearsky_ghi"]
    with np.errstate(invalid="ignore", divide="ignore"):
        kt = np.where(cs > 50.0, A["ghi"] / np.maximum(cs, 1.0), np.nan)
    A["kt"] = np.clip(kt, 0.0, 1.3)
    for t in TARGETS:
        A[f"{t}_m24"] = pd.Series(A[t]).rolling(24, min_periods=6).mean().to_numpy()
    return A


def _features(A: dict[str, np.ndarray], tau: np.ndarray, iss: np.ndarray, target: str, use_nwp: bool) -> pd.DataFrame:
    """Feature matrix for target hours ``tau`` forecast from issue indices ``iss``.

    Every measured quantity is read at ``iss`` or earlier (``tau - 24 <= iss`` whenever the
    lead time is at most 24 h), so the same code is safe for training and for operation.
    """
    h = (tau - iss).astype(float)
    hod, doy = A["hod"][tau], A["doy"][tau]
    f = {
        "h": h,
        "hod_s": np.sin(2 * np.pi * hod / 24.0),
        "hod_c": np.cos(2 * np.pi * hod / 24.0),
        "doy_s": np.sin(2 * np.pi * doy / 365.0),
        "doy_c": np.cos(2 * np.pi * doy / 365.0),
        "dow": A["dow"][tau],
        "sun_elev": A["sun_elev"][tau],
        "cs_ghi": A["clearsky_ghi"][tau],
        "lag24": A[target][tau - 24],
        "y_iss": A[target][iss],
        "y_m24": A[f"{target}_m24"][iss],
        "kt_iss": A["kt"][iss],
        "temp_iss": A["temp"][iss],
        "wind_iss": A["wind_speed"][iss],
        "kt_l24": A["kt"][tau - 24],
        "temp_l24": A["temp"][tau - 24],
        "wind_l24": A["wind_speed"][tau - 24],
    }
    if use_nwp:
        for c in NWP_COLS:
            f[c] = A[c][tau]
    return pd.DataFrame(f)


def _make_model(fc: ForecastConfig, seed: int):
    try:
        from xgboost import XGBRegressor

        return XGBRegressor(
            n_estimators=fc.n_estimators,
            max_depth=fc.max_depth,
            learning_rate=fc.learning_rate,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=3,
            tree_method="hist",
            n_jobs=os.cpu_count() or 1,
            random_state=seed,
        )
    except ImportError:  # keeps the EMS installable on minimal edge images
        from sklearn.ensemble import HistGradientBoostingRegressor

        return HistGradientBoostingRegressor(
            max_iter=fc.n_estimators, max_depth=fc.max_depth, learning_rate=fc.learning_rate, random_state=seed
        )


def _r2(y: np.ndarray, p: np.ndarray) -> float:
    ss_res = float(np.sum((y - p) ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    return 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan")


# --------------------------------------------------------------------------- bundle
class ForecastBundle:
    """The trained model set (3 targets x 2 variants) plus uncertainty statistics."""

    def __init__(self, cfg: StationConfig):
        self.cfg = cfg
        self.models: dict[tuple[str, str], object] = {}
        self.feature_names: dict[tuple[str, str], list[str]] = {}
        self.resid_q: dict[tuple[str, str], list[tuple[float, float]]] = {}
        self.metrics: dict[str, pd.DataFrame] = {}

    # ----------------------------------------------------------------- training
    def fit(
        self, train: pd.DataFrame, holdouts: list[pd.DataFrame], seed: int = 0, verbose: bool = False
    ) -> "ForecastBundle":
        """Train on ``train``; calibrate the uncertainty bands on frames the models never saw."""
        fc = self.cfg.forecast
        rng = np.random.default_rng(seed)
        for variant in ("nwp", "local"):
            use_nwp = variant == "nwp"
            A = _arrays(train)
            n = len(train)
            tau = np.repeat(np.arange(48, n), fc.reps_per_hour)
            h = rng.integers(1, HORIZON + 1, size=tau.size)
            iss = tau - h
            for target in TARGETS:
                X = _features(A, tau, iss, target, use_nwp)
                y = A[target][tau]
                ok = np.isfinite(y)
                model = _make_model(fc, seed)
                model.fit(X[ok], y[ok])
                self.models[(target, variant)] = model
                self.feature_names[(target, variant)] = list(X.columns)
                if verbose:
                    print(f"  trained {target:8s} [{variant:5s}] on {ok.sum():6d} rows")
        self._calibrate(holdouts, rng)
        return self

    def _calibrate(self, frames: list[pd.DataFrame], rng: np.random.Generator) -> None:
        """Empirical p10/p90 of forecast error per horizon bucket, pooled over held-out frames."""
        pooled: dict[tuple[str, str], list[tuple[np.ndarray, np.ndarray]]] = {}
        for frame in frames:
            A = _arrays(frame)
            tau = np.repeat(np.arange(48, len(frame)), 2)
            h = rng.integers(1, HORIZON + 1, size=tau.size)
            iss = tau - h
            bucket = np.digitize(h, _BUCKETS[:-1], right=True)
            for variant in ("nwp", "local"):
                for target in TARGETS:
                    pred = self._predict_raw(A, tau, iss, target, variant)
                    resid = A[target][tau] - pred
                    mask = np.isfinite(resid)
                    if target == "pv_kw":
                        mask &= A["sun_elev"][tau] > 0
                    pooled.setdefault((target, variant), []).append((resid[mask], bucket[mask]))
        for key, parts in pooled.items():
            resid = np.concatenate([p[0] for p in parts])
            bucket = np.concatenate([p[1] for p in parts])
            qs = []
            for b in range(len(_BUCKETS)):
                r = resid[bucket == b]
                qs.append((float(np.quantile(r, 0.10)), float(np.quantile(r, 0.90))) if len(r) > 20 else (-5.0, 5.0))
            self.resid_q[key] = qs

    # --------------------------------------------------------------- prediction
    def _predict_raw(self, A, tau, iss, target: str, variant: str) -> np.ndarray:
        X = _features(A, tau, iss, target, variant == "nwp")
        return self.models[(target, variant)].predict(X[self.feature_names[(target, variant)]])

    def _post(self, target: str, values: np.ndarray, sun_elev: np.ndarray) -> np.ndarray:
        c = self.cfg
        if target == "pv_kw":
            return np.where(sun_elev > 0, np.clip(values, 0.0, c.pv.inverter_kw), 0.0)
        if target == "wind_kw":
            return np.clip(values, 0.0, c.wind.rated_kw)
        return np.clip(values, 5.0, None)

    def predict(self, frame: pd.DataFrame, iss: int, use_nwp: bool = True, horizon: int = HORIZON) -> pd.DataFrame:
        """Forecast hours ``iss+1 .. iss+horizon``.

        ``frame`` must hold measured columns up to row ``iss`` and known-in-advance columns
        (astronomy, and NWP if ``use_nwp``) through row ``iss + horizon``. Values in
        measured columns after ``iss`` are never read.
        """
        variant = "nwp" if use_nwp else "local"
        A = _arrays(frame)
        tau = np.arange(iss + 1, iss + 1 + horizon)
        issv = np.full_like(tau, iss)
        bucket = np.digitize(tau - iss, _BUCKETS[:-1], right=True)
        out = pd.DataFrame(index=frame.index[tau])
        for target in TARGETS:
            raw_mean = self._predict_raw(A, tau, issv, target, variant)
            q = np.array([self.resid_q[(target, variant)][b] for b in bucket])
            mean = self._post(target, raw_mean, A["sun_elev"][tau])
            lo = self._post(target, raw_mean + q[:, 0], A["sun_elev"][tau])
            hi = self._post(target, raw_mean + q[:, 1], A["sun_elev"][tau])
            out[target] = mean
            out[f"{target}_lo"] = np.minimum(lo, mean)  # clipping (e.g. at night, or at 0) can invert the order; enforce it
            out[f"{target}_hi"] = np.maximum(hi, mean)
        return out

    # --------------------------------------------------------------- evaluation
    def evaluate(self, frame: pd.DataFrame, start: int, use_nwp: bool = True, every: int = 6) -> pd.DataFrame:
        """Rolling-origin evaluation over ``frame.iloc[start:]`` against a same-hour-yesterday baseline."""
        variant = "nwp" if use_nwp else "local"
        A = _arrays(frame)
        n = len(frame)
        issues = np.arange(max(start, 48), n - HORIZON - 1, every)
        tau = (issues[:, None] + np.arange(1, HORIZON + 1)[None, :]).ravel()
        iss = np.repeat(issues, HORIZON)
        rows = []
        for target in TARGETS:
            y = A[target][tau]
            pred = self._post(target, self._predict_raw(A, tau, iss, target, variant), A["sun_elev"][tau])
            base = A[target][tau - 24]  # persistence: same hour yesterday
            mae, mae_b = np.mean(np.abs(y - pred)), np.mean(np.abs(y - base))
            cap = {"pv_kw": self.cfg.pv.kwp, "wind_kw": self.cfg.wind.rated_kw}.get(target, np.mean(y))
            # daily-mean skill (the figure quoted for the Antarctic XGBoost study)
            days = (tau // 24)
            daily = pd.DataFrame({"y": y, "p": pred, "d": days}).groupby("d").mean()
            rows.append(
                {
                    "target": target,
                    "variant": variant,
                    "MAE_kW": mae,
                    "RMSE_kW": float(np.sqrt(np.mean((y - pred) ** 2))),
                    "nRMSE_%": 100 * float(np.sqrt(np.mean((y - pred) ** 2))) / cap,
                    "R2_hourly": _r2(y, pred),
                    "R2_daily_mean": _r2(daily["y"].to_numpy(), daily["p"].to_numpy()),
                    "MAE_persistence_kW": mae_b,
                    "skill_vs_persistence_%": 100 * (1 - mae / mae_b) if mae_b > 1e-9 else float("nan"),
                }
            )
        return pd.DataFrame(rows)

    # ------------------------------------------------------------------- io
    def save(self, path: str | Path) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, path)

    @staticmethod
    def load(path: str | Path) -> "ForecastBundle":
        return joblib.load(path)


# --------------------------------------------------------------------- helpers
def build_inference_frame(
    hist: pd.DataFrame, horizon: int, site: SiteConfig, nwp: pd.DataFrame | None
) -> tuple[pd.DataFrame, int]:
    """Stack measured history and the known-in-advance future into one frame for ``predict``.

    ``hist`` is the measured/cleaned history (index = hourly timestamps, columns ``MEASURED``).
    """
    tail = hist.iloc[-96:].copy()
    tail = tail.join(astro_frame(tail.index, site)[ASTRO_COLS]) if "sun_elev" not in tail else tail
    fut_idx = pd.date_range(tail.index[-1] + pd.Timedelta(hours=1), periods=horizon, freq="h")
    fut = astro_frame(fut_idx, site)
    for c in NWP_COLS:
        fut[c] = np.nan
    if nwp is not None:
        fut[NWP_COLS] = nwp.reindex(fut_idx)[NWP_COLS].to_numpy()
    for c in MEASURED:
        fut[c] = np.nan
    for c in NWP_COLS:  # history rows do not need NWP but the column must exist
        if c not in tail:
            tail[c] = np.nan
    cols = list(dict.fromkeys(ASTRO_COLS + NWP_COLS + MEASURED))
    frame = pd.concat([tail[cols], fut[cols]])
    return frame, len(tail) - 1


def train_bundle(cfg: StationConfig, seed: int = 42, verbose: bool = True) -> ForecastBundle:
    """Train on a synthetic multi-season history and report skill on two *unseen* worlds.

    Held-out data: 30 days of austral summer (midnight sun) and 30 days of winter (polar
    night), each drawn from a fresh random seed. Swap ``World`` for a loader over real station
    data (same columns) to train on reality.
    """
    fc = cfg.forecast
    train = World(cfg, "2023-06-01", 24 * fc.train_days, seed=seed).frame()
    hold = {
        "summer": World(cfg, "2024-12-01", 24 * fc.valid_days, seed=seed + 1).frame(),
        "winter": World(cfg, "2024-06-10", 24 * fc.valid_days, seed=seed + 2).frame(),
    }
    if verbose:
        print(f"Training on {fc.train_days} days; holding out {fc.valid_days} d summer + {fc.valid_days} d winter ...")
    bundle = ForecastBundle(cfg).fit(train, list(hold.values()), seed=seed, verbose=verbose)
    for use_nwp in (True, False):
        parts = []
        for season, frame in hold.items():
            m = bundle.evaluate(frame, 48, use_nwp=use_nwp)
            m.insert(1, "season", season)
            parts.append(m)
        bundle.metrics["nwp" if use_nwp else "local"] = pd.concat(parts, ignore_index=True)
    return bundle



def load_or_train(cfg: StationConfig, seed: int = 42, verbose: bool = True, force: bool = False) -> ForecastBundle:
    # 1. Check pre-bundled model in repo (backend/models/)
    bundled_path = Path(__file__).resolve().parent.parent / "models" / f"forecast_bundle_seed{seed}.joblib"
    if bundled_path.exists() and not force:
        try:
            if verbose:
                print(f"Loading pre-bundled models from {bundled_path} ...", flush=True)
            return ForecastBundle.load(bundled_path)
        except Exception as exc:
            if verbose:
                print(f"Bundled model load failed ({exc}); falling back.")

    # 2. Check MODEL_DIR env var or cfg.forecast.model_dir
    model_dir = os.environ.get("MODEL_DIR", cfg.forecast.model_dir)
    path = Path(model_dir) / f"forecast_bundle_seed{seed}.joblib"
    Path(model_dir).mkdir(parents=True, exist_ok=True)
    if path.exists() and not force:
        try:
            return ForecastBundle.load(path)
        except Exception as exc:  # stale pickle from another library version
            if verbose:
                print(f"Cached models unusable ({exc}); retraining.")
    bundle = train_bundle(cfg, seed=seed, verbose=verbose)
    bundle.save(path)
    return bundle
