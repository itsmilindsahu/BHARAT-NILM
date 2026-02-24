"""
inference_engine.py
-------------------
Loads all trained models and exposes a single .predict() method.

Improvements over v1:
- Thread-safe sequence buffer (no shared mutable state across requests)
- Loads LSTM scaler for proper denormalisation
- Matches richer feature set used in training (rolling_mean_5, rolling_std_5)
- Graceful fallback if LSTM sequence not ready yet
"""
import os
import threading
import torch
import torch.nn as nn
import joblib
import numpy as np
import pandas as pd


# ------------------------------------------------------------------
# LSTM Model definition (must match train_lstm.py exactly)
# ------------------------------------------------------------------
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


# ------------------------------------------------------------------
# Inference Engine
# ------------------------------------------------------------------
class InferenceEngine:

    SEQ_LEN = 24

    def __init__(self):
        base_dir  = os.path.dirname(os.path.abspath(__file__))
        model_dir = os.path.join(base_dir, "models")

        print("Loading models...")

        self.rf     = joblib.load(os.path.join(model_dir, "rf_model.pkl"))
        self.gb     = joblib.load(os.path.join(model_dir, "gb_model.pkl"))
        self.logreg = joblib.load(os.path.join(model_dir, "logreg_model.pkl"))
        self.hmm    = joblib.load(os.path.join(model_dir, "hmm_model.pkl"))

        # LSTM + optional scaler
        self.lstm = LSTMModel()
        self.lstm.load_state_dict(
            torch.load(os.path.join(model_dir, "lstm_model.pt"), map_location="cpu")
        )
        self.lstm.eval()

        scaler_path = os.path.join(model_dir, "lstm_scaler.pkl")
        self.lstm_scaler = joblib.load(scaler_path) if os.path.exists(scaler_path) else None

        print("All models loaded successfully.")

        # Thread-local sequence buffer — each thread keeps its own window
        self._local = threading.local()

    def _get_sequence(self):
        if not hasattr(self._local, "sequence"):
            self._local.sequence = []
        return self._local.sequence

    # ------------------------------------------------------------------
    def predict(self, aggregate: float, timestamp: str) -> dict:
        seq = self._get_sequence()

        # --- Delta ---
        delta = (aggregate - seq[-1]) if seq else 0.0

        # --- Rolling features (last 5 readings + current) ---
        window = seq[-4:] + [aggregate]   # up to 5 values
        roll_mean = float(np.mean(window))
        roll_std  = float(np.std(window))

        hour = pd.to_datetime(timestamp).hour

        # --- RF: appliance label ---
        rf_features = [[aggregate, delta, hour, roll_mean, roll_std]]
        rf_label    = self.rf.predict(rf_features)[0]
        rf_conf     = float(max(self.rf.predict_proba(rf_features)[0]))

        # --- GB: next-interval usage ---
        gb_features  = [[aggregate, delta, hour, roll_mean, roll_std]]
        gb_usage_next = float(self.gb.predict(gb_features)[0])

        # --- LogReg: anomaly probability ---
        anomaly_features = [[aggregate, delta, roll_std]]
        anomaly_prob = float(self.logreg.predict_proba(anomaly_features)[0][1])

        # --- HMM: consumption regime ---
        hmm_state = int(self.hmm.predict([[aggregate]])[0])

        # --- Update sequence buffer ---
        seq.append(aggregate)
        if len(seq) > self.SEQ_LEN:
            seq.pop(0)

        # --- LSTM: short-term forecast ---
        forecast_w = 0.0
        if len(seq) == self.SEQ_LEN:
            raw = np.array(seq, dtype=np.float32).reshape(-1, 1)

            if self.lstm_scaler:
                scaled = self.lstm_scaler.transform(raw).flatten()
            else:
                scaled = raw.flatten()

            x = torch.tensor(scaled).float().unsqueeze(0).unsqueeze(-1)
            with torch.no_grad():
                pred_scaled = float(self.lstm(x).item())

            if self.lstm_scaler:
                forecast_w = float(
                    self.lstm_scaler.inverse_transform([[pred_scaled]])[0][0]
                )
            else:
                forecast_w = pred_scaled

        return {
            "aggregate":      float(aggregate),
            "delta":          float(delta),
            "rf_label":       rf_label,
            "rf_confidence":  rf_conf,
            "gb_usage_next":  gb_usage_next,
            "anomaly_score":  anomaly_prob,
            "hmm_state":      hmm_state,
            "lstm_forecast":  forecast_w,
        }