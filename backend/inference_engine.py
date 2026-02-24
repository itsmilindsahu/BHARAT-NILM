import os
import torch
import joblib
import pandas as pd
import torch.nn as nn


# -------- LSTM MODEL --------
class LSTMModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.lstm = nn.LSTM(1, 64, batch_first=True)
        self.fc = nn.Linear(64, 1)

    def forward(self, x):
        out, _ = self.lstm(x)
        return self.fc(out[:, -1, :])


# -------- INFERENCE ENGINE --------
class InferenceEngine:

    def __init__(self):

        base_dir = os.path.dirname(__file__)
        model_dir = os.path.join(base_dir, "models")

        print("Loading models...")

        self.rf = joblib.load(os.path.join(model_dir, "rf_model.pkl"))
        self.gb = joblib.load(os.path.join(model_dir, "gb_model.pkl"))
        self.logreg = joblib.load(os.path.join(model_dir, "logreg_model.pkl"))
        self.hmm = joblib.load(os.path.join(model_dir, "hmm_model.pkl"))

        self.lstm = LSTMModel()
        self.lstm.load_state_dict(
            torch.load(os.path.join(model_dir, "lstm_model.pt"))
        )
        self.lstm.eval()

        print("All models loaded successfully.")

        self.sequence = []
        self.seq_len = 24

    def predict(self, aggregate, timestamp):

        delta = 0
        if len(self.sequence) > 0:
            delta = aggregate - self.sequence[-1]

        hour = pd.to_datetime(timestamp).hour

        rf_pred = self.rf.predict([[aggregate, delta, hour]])[0]
        rf_conf = max(self.rf.predict_proba([[aggregate, delta, hour]])[0])

        gb_next = self.gb.predict([[aggregate, hour]])[0]

        anomaly_prob = self.logreg.predict_proba([[aggregate, delta]])[0][1]

        hmm_state = int(self.hmm.predict([[aggregate]])[0])

        self.sequence.append(aggregate)
        if len(self.sequence) > self.seq_len:
            self.sequence.pop(0)

        forecast = 0
        if len(self.sequence) == self.seq_len:
            x = torch.tensor(self.sequence).float().unsqueeze(0).unsqueeze(-1)
            forecast = float(self.lstm(x).item())

        return {
            "aggregate": float(aggregate),
            "delta": float(delta),
            "rf_label": rf_pred,
            "rf_confidence": float(rf_conf),
            "gb_usage_next": float(gb_next),
            "anomaly_score": float(anomaly_prob),
            "hmm_state": hmm_state,
            "lstm_forecast": forecast
        }
