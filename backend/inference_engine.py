"""
inference_engine.py
-------------------
Real inference engine — uses the exact same features as training:

  RF / GB  : aggregate, delta, hour, roll_mean_5, roll_std_5
  LogReg   : aggregate, delta, roll_std_5
  HMM      : aggregate (reshape -1,1)
  LSTM     : sequence of 24 MinMax-normalised aggregate values
              (requires lstm_scaler.pkl saved during training)
"""

import os
import torch
import torch.nn as nn
import joblib
import numpy as np
import pandas as pd
from collections import deque
from datetime import datetime


# ──────────────────────────────────────────────────────────
# LSTM architecture  (must match train_lstm.py exactly)
# ──────────────────────────────────────────────────────────
class LSTMModel(nn.Module):
    def __init__(self, input_size=1, hidden_size=64, dropout=0.2):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size, hidden_size,
            num_layers=2,
            batch_first=True,
            dropout=dropout,
        )
        self.fc = nn.Linear(hidden_size, 1)

    def forward(self, x):
        out, _ = self.lstm(x)
        return self.fc(out[:, -1, :])


# ──────────────────────────────────────────────────────────
# Inference Engine
# ──────────────────────────────────────────────────────────
class InferenceEngine:

    SEQ_LEN = 24   # must match train_lstm.py

    def __init__(self):
        # inference_engine.py is at backend/inference_engine.py
        # models/ is at backend/models/ — same directory level
        base_dir  = os.path.dirname(os.path.abspath(__file__))
        model_dir = os.path.join(base_dir, "models")
        print(f"[Engine] model_dir = {model_dir}")

        print("Loading models...")

        # Sklearn / joblib models
        self.rf     = joblib.load(os.path.join(model_dir, "rf_model.pkl"))
        self.gb     = joblib.load(os.path.join(model_dir, "gb_model.pkl"))
        self.logreg = joblib.load(os.path.join(model_dir, "logreg_model.pkl"))
        self.hmm    = joblib.load(os.path.join(model_dir, "hmm_model.pkl"))

        # LSTM + its scaler
        self.lstm = LSTMModel()
        self.lstm.load_state_dict(
            torch.load(os.path.join(model_dir, "lstm_model.pt"), map_location="cpu")
        )
        self.lstm.eval()

        scaler_path = os.path.join(model_dir, "lstm_scaler.pkl")
        if os.path.exists(scaler_path):
            self.lstm_scaler = joblib.load(scaler_path)
        else:
            self.lstm_scaler = None
            print("WARNING: lstm_scaler.pkl not found — LSTM output will be normalised.")

        print("All models loaded successfully.")

        # Rolling buffers for feature computation
        self._agg_buffer  = deque(maxlen=5)     # for rolling mean/std (window=5)
        self._seq_buffer  = deque(maxlen=self.SEQ_LEN)  # for LSTM sequence
        self._prev_agg    = None                 # for delta

    # ── Feature engineering (matches training exactly) ──────
    def _build_features(self, aggregate: float, timestamp: str):
        """
        Returns feature dicts for each model.
        Replicates the pandas feature engineering done at training time.
        """
        ts   = pd.to_datetime(timestamp)
        hour = ts.hour

        # delta = diff from previous reading (fillna(0) at start)
        delta = float(aggregate - self._prev_agg) if self._prev_agg is not None else 0.0
        self._prev_agg = aggregate

        # Update rolling buffer
        self._agg_buffer.append(aggregate)
        buf = list(self._agg_buffer)

        roll_mean_5 = float(np.mean(buf))
        roll_std_5  = float(np.std(buf, ddof=0)) if len(buf) > 1 else 0.0

        # RF / GB features: ["aggregate","delta","hour","roll_mean_5","roll_std_5"]
        feat_rf = pd.DataFrame([{
            "aggregate":   aggregate,
            "delta":       delta,
            "hour":        hour,
            "roll_mean_5": roll_mean_5,
            "roll_std_5":  roll_std_5,
        }])

        # LogReg features: ["aggregate","delta","roll_std_5"]
        feat_lr = pd.DataFrame([{
            "aggregate":  aggregate,
            "delta":      delta,
            "roll_std_5": roll_std_5,
        }])

        return feat_rf, feat_lr, delta, roll_std_5

    # ── Main predict method ──────────────────────────────────
    def predict(self, aggregate: float, timestamp: str | None = None) -> dict:

        if timestamp is None:
            timestamp = datetime.now().isoformat()

        feat_rf, feat_lr, delta, roll_std_5 = self._build_features(aggregate, timestamp)

        # ── Random Forest: appliance label + confidence ──────
        rf_label      = self.rf.predict(feat_rf)[0]
        rf_proba      = self.rf.predict_proba(feat_rf)[0]
        rf_confidence = float(rf_proba.max())
        rf_classes    = list(self.rf.classes_)
        rf_all_proba  = {cls: round(float(p), 4) for cls, p in zip(rf_classes, rf_proba)}

        # ── Gradient Boosting: next-step consumption forecast ─
        gb_next = float(self.gb.predict(feat_rf)[0])

        # ── Logistic Regression: anomaly probability ──────────
        anomaly_proba = float(self.logreg.predict_proba(feat_lr)[0][1])
        is_anomaly    = anomaly_proba > 0.5

        # ── HMM: energy regime state ─────────────────────────
        hmm_obs   = np.array([[aggregate]], dtype=np.float32)
        hmm_state = int(self.hmm.predict(hmm_obs)[0])

        # Map state index to label by sorting means ascending
        means         = self.hmm.means_.flatten()
        sorted_states = np.argsort(means)           # low → high
        regime_map    = {int(s): lbl for s, lbl in zip(sorted_states, ["standby", "normal", "peak"])}
        hmm_regime    = regime_map.get(hmm_state, "normal")

        # ── LSTM: next-step load forecast ────────────────────
        self._seq_buffer.append(aggregate)
        lstm_forecast = None

        if len(self._seq_buffer) == self.SEQ_LEN:
            seq = np.array(list(self._seq_buffer), dtype=np.float32).reshape(-1, 1)

            if self.lstm_scaler is not None:
                seq_norm = self.lstm_scaler.transform(seq)
            else:
                # Fallback: min-max normalise within sequence
                mn, mx = seq.min(), seq.max()
                seq_norm = (seq - mn) / (mx - mn + 1e-8)

            x = torch.tensor(seq_norm, dtype=torch.float32).unsqueeze(0)  # (1, 24, 1)

            with torch.no_grad():
                pred_norm = self.lstm(x).item()

            if self.lstm_scaler is not None:
                lstm_forecast = float(
                    self.lstm_scaler.inverse_transform([[pred_norm]])[0][0]
                )
            else:
                lstm_forecast = float(pred_norm * (mx - mn) + mn)

        # ── Assemble response ─────────────────────────────────
        return {
            # Raw input echo
            "aggregate":      round(aggregate, 2),
            "timestamp":      timestamp,
            "delta":          round(delta, 2),

            # RF — appliance classification
            "rf_label":       rf_label,
            "rf_confidence":  round(rf_confidence, 4),
            "rf_all_proba":   rf_all_proba,

            # GB — next consumption forecast
            "gb_next_watt":   round(gb_next, 2),

            # LogReg — anomaly detection
            "anomaly_score":  round(anomaly_proba, 4),
            "is_anomaly":     is_anomaly,

            # HMM — energy regime
            "hmm_state":      hmm_state,
            "hmm_regime":     hmm_regime,

            # LSTM — load forecast
            "lstm_forecast":  round(lstm_forecast, 2) if lstm_forecast is not None else None,
            "lstm_ready":     lstm_forecast is not None,
        }

    def reset(self):
        """Reset all rolling buffers (call between sessions if needed)."""
        self._agg_buffer.clear()
        self._seq_buffer.clear()
        self._prev_agg = None