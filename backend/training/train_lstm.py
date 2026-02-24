"""
train_lstm.py  —  LSTM sequence model for short-term load forecasting
Improvements:
  - MinMax normalization (prevents gradient explosion)
  - Dropout for regularisation
  - DataLoader for proper batching instead of one giant forward pass
  - Model + scaler saved together so inference can denormalise correctly
"""
import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
import pandas as pd
import numpy as np
import joblib
from sklearn.preprocessing import MinMaxScaler


# ------------------------------------------------------------------
# Model
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
# Main
# ------------------------------------------------------------------
def main():
    base_dir     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dataset_path = os.path.join(base_dir, "dataset", "uk_dale.csv")
    model_path   = os.path.join(base_dir, "models", "lstm_model.pt")
    scaler_path  = os.path.join(base_dir, "models", "lstm_scaler.pkl")

    print("Loading dataset from:", dataset_path)
    df = pd.read_csv(dataset_path)

    if len(df) < 50:
        raise ValueError("Dataset too small. Run generate_dataset.py first.")

    raw = df["aggregate"].values.astype(np.float32).reshape(-1, 1)

    # Normalise
    scaler = MinMaxScaler()
    data = scaler.fit_transform(raw).flatten()

    seq_len = 24
    X, y = [], []
    for i in range(len(data) - seq_len):
        X.append(data[i:i + seq_len])
        y.append(data[i + seq_len])

    X_t = torch.tensor(X, dtype=torch.float32).unsqueeze(-1)
    y_t = torch.tensor(y, dtype=torch.float32).unsqueeze(-1)

    dataset  = TensorDataset(X_t, y_t)
    loader   = DataLoader(dataset, batch_size=64, shuffle=True)

    print(f"Sequences: {len(X_t)}")

    model     = LSTMModel()
    criterion = nn.MSELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    scheduler = torch.optim.lr_scheduler.StepLR(optimizer, step_size=10, gamma=0.5)

    epochs = 30
    for epoch in range(1, epochs + 1):
        model.train()
        total_loss = 0
        for xb, yb in loader:
            optimizer.zero_grad()
            loss = criterion(model(xb), yb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total_loss += loss.item()
        scheduler.step()
        avg = total_loss / len(loader)
        if epoch % 5 == 0 or epoch == 1:
            print(f"Epoch {epoch:3d}/{epochs} | Loss: {avg:.6f}")

    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    torch.save(model.state_dict(), model_path)
    joblib.dump(scaler, scaler_path)
    print(f"LSTM model saved to: {model_path}")
    print(f"Scaler saved to:     {scaler_path}")


if __name__ == "__main__":
    main()