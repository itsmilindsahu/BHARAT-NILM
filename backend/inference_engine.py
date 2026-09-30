"""Inference for the polar-station operating and energy models."""

import os
from collections import deque
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn


class LSTMModel(nn.Module):
    def __init__(self, input_size=3, hidden_size=64, output_size=2, dropout=0.2):
        super().__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers=2, batch_first=True, dropout=dropout)
        self.fc = nn.Linear(hidden_size, output_size)

    def forward(self, x):
        output, _ = self.lstm(x)
        return self.fc(output[:, -1, :])


class InferenceEngine:
    SEQ_LEN = 24
    RF_FEATURES = [
        "aggregate", "ambient_temp", "wind_speed", "solar_irradiance",
        "daylight_hours", "battery_soc", "fuel_level", "is_extreme_event",
    ]
    LR_FEATURES = [
        "aggregate", "ambient_temp", "wind_speed", "solar_irradiance",
        "daylight_hours", "battery_soc", "fuel_level", "fuel_consumption_rate",
        "is_extreme_event", "delta_load", "renewable_total",
    ]
    HMM_FEATURES = ["wind_speed", "ambient_temp", "daylight_hours", "aggregate", "is_extreme_event"]

    def __init__(self):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        model_dir = os.path.join(base_dir, "models")
        self.rf = joblib.load(os.path.join(model_dir, "rf_model.pkl"))
        gb_bundle = joblib.load(os.path.join(model_dir, "gb_model.pkl"))
        self.gb = gb_bundle.get("model", gb_bundle) if isinstance(gb_bundle, dict) else gb_bundle
        logreg_bundle = joblib.load(os.path.join(model_dir, "logreg_model.pkl"))
        self.logreg = logreg_bundle.get("model", logreg_bundle) if isinstance(logreg_bundle, dict) else logreg_bundle
        hmm_bundle = joblib.load(os.path.join(model_dir, "hmm_model.pkl"))
        if isinstance(hmm_bundle, dict):
            self.hmm = hmm_bundle["model"]
            self.hmm_scaler = hmm_bundle["scaler"]
            self.hmm_state_labels = {int(key): value for key, value in hmm_bundle["state_labels"].items()}
        else:
            self.hmm = hmm_bundle
            self.hmm_scaler = None
            self.hmm_state_labels = {}

        self.lstm = LSTMModel()
        self.lstm.load_state_dict(torch.load(
            os.path.join(model_dir, "lstm_model.pt"),
            map_location="cpu",
            weights_only=True,
        ))
        self.lstm.eval()
        scaler_bundle = joblib.load(os.path.join(model_dir, "lstm_scaler.pkl"))
        self.lstm_input_scaler = scaler_bundle.get("input") if isinstance(scaler_bundle, dict) else scaler_bundle
        self.lstm_target_scaler = scaler_bundle.get("target") if isinstance(scaler_bundle, dict) else scaler_bundle

        self._agg_buffer = deque(maxlen=5)
        self._seq_buffer = deque(maxlen=self.SEQ_LEN)
        self._prev_agg = None

    def _normalise_telemetry(self, telemetry: dict | None) -> dict:
        telemetry = telemetry or {}
        return {
            "ambient_temp": float(telemetry.get("ambient_temp", -17.0)),
            "wind_speed": float(telemetry.get("wind_speed", 0.0)),
            "solar_irradiance": float(telemetry.get("solar_irradiance", 0.0)),
            "daylight_hours": float(telemetry.get("daylight_hours", 0.0)),
            "battery_soc": float(telemetry.get("battery_soc", 0.5)),
            "fuel_level": float(telemetry.get("fuel_level", 10_000.0)),
            "fuel_consumption_rate": float(telemetry.get("fuel_consumption_rate", 0.0)),
            "wind_gen_output": float(telemetry.get("wind_gen_output", 0.0)),
            "solar_gen_output": float(telemetry.get("solar_gen_output", 0.0)),
            "is_extreme_event": int(bool(telemetry.get("is_extreme_event", False))),
        }

    def _build_features(self, aggregate: float, timestamp: str, telemetry: dict | None):
        ts = pd.to_datetime(timestamp)
        telemetry = self._normalise_telemetry(telemetry)
        delta = float(aggregate - self._prev_agg) if self._prev_agg is not None else 0.0
        self._prev_agg = aggregate
        self._agg_buffer.append(aggregate)
        values = dict(telemetry)
        values.update({
            "aggregate": float(aggregate),
            "delta_load": delta,
            "renewable_total": telemetry["wind_gen_output"] + telemetry["solar_gen_output"],
            "hour": ts.hour,
        })
        rf_features = pd.DataFrame([{key: values[key] for key in self.RF_FEATURES}])
        gb_features = rf_features.copy()
        lr_features = pd.DataFrame([{key: values[key] for key in self.LR_FEATURES}])
        hmm_features = pd.DataFrame([{key: values[key] for key in self.HMM_FEATURES}])
        lstm_input = np.array([[telemetry["fuel_consumption_rate"], telemetry["wind_gen_output"], telemetry["solar_gen_output"]]], dtype=np.float32)
        return rf_features, gb_features, lr_features, hmm_features, lstm_input, delta, values

    def predict(self, aggregate: float, timestamp: str | None = None, telemetry: dict | None = None) -> dict:
        timestamp = timestamp or datetime.now().isoformat()
        rf_features, gb_features, lr_features, hmm_features, lstm_input, delta, values = self._build_features(
            float(aggregate), timestamp, telemetry,
        )

        rf_label = str(self.rf.predict(rf_features)[0])
        rf_proba = self.rf.predict_proba(rf_features)[0]
        rf_all_proba = {str(label): round(float(probability), 4) for label, probability in zip(self.rf.classes_, rf_proba)}
        gb_prediction = np.asarray(self.gb.predict(gb_features)[0], dtype=float).reshape(-1)
        if len(gb_prediction) == 1:
            gb_prediction = np.array([gb_prediction[0], 0.0, 0.0])
        gb_load_kw, gb_wind_kw, gb_solar_kw = np.maximum(gb_prediction[:3], 0.0)

        anomaly_proba = float(self.logreg.predict_proba(lr_features)[0][1])
        if self.hmm_scaler is not None:
            hmm_observation = self.hmm_scaler.transform(hmm_features).astype(np.float32)
        else:
            # Accept the previous three-state artifact until the new HMM is trained.
            hmm_observation = np.array([[float(aggregate)]], dtype=np.float32)
        hmm_state = int(self.hmm.predict(hmm_observation)[0])
        if self.hmm_state_labels:
            hmm_regime = self.hmm_state_labels.get(hmm_state, "calm")
        else:
            means = self.hmm.means_.flatten()
            sorted_states = np.argsort(means)
            hmm_regime = {
                int(state): label
                for state, label in zip(sorted_states, ["polar-night", "calm", "storm"])
            }.get(hmm_state, "calm")

        self._seq_buffer.append(lstm_input[0])
        lstm_fuel = None
        lstm_renewable = None
        if len(self._seq_buffer) == self.SEQ_LEN:
            sequence = np.asarray(self._seq_buffer, dtype=np.float32)
            sequence = self.lstm_input_scaler.transform(sequence)
            with torch.no_grad():
                prediction = self.lstm(torch.tensor(sequence).unsqueeze(0)).numpy()
            prediction = self.lstm_target_scaler.inverse_transform(prediction)[0]
            lstm_fuel = max(0.0, float(prediction[0]))
            lstm_renewable = max(0.0, float(prediction[1]))

        return {
            "aggregate": round(float(aggregate), 3),
            "timestamp": timestamp,
            "delta": round(delta, 3),
            "rf_label": rf_label,
            "rf_regime": rf_label,
            "rf_confidence": round(float(rf_proba.max()), 4),
            "rf_all_proba": rf_all_proba,
            "gb_next_load_kw": round(float(gb_load_kw), 3),
            "gb_next_wind_kw": round(float(gb_wind_kw), 3),
            "gb_next_solar_kw": round(float(gb_solar_kw), 3),
            "gb_next_renewable_kw": round(float(gb_wind_kw + gb_solar_kw), 3),
            "gb_next_watt": round(float(gb_load_kw * 1000), 2),
            "anomaly_score": round(anomaly_proba, 4),
            "is_anomaly": anomaly_proba > 0.5,
            "hmm_state": hmm_state,
            "hmm_regime": hmm_regime,
            "lstm_fuel_forecast": round(lstm_fuel, 4) if lstm_fuel is not None else None,
            "lstm_renewable_forecast": round(lstm_renewable, 4) if lstm_renewable is not None else None,
            "lstm_forecast": round(lstm_fuel, 4) if lstm_fuel is not None else None,
            "lstm_ready": lstm_fuel is not None,
            "telemetry": values,
        }

    def reset(self):
        self._agg_buffer.clear()
        self._seq_buffer.clear()
        self._prev_agg = None
