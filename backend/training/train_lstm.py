"""Train a 24-step forecaster for fuel use and renewable generation."""

import os

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.preprocessing import MinMaxScaler
from torch.utils.data import DataLoader, TensorDataset


SEQ_LEN = 24
INPUT_COLUMNS = ["fuel_consumption_rate", "wind_gen_output", "solar_gen_output"]
TARGET_COLUMNS = ["fuel_consumption_rate", "renewable_total"]


class LSTMModel(nn.Module):
    def __init__(self, input_size=3, hidden_size=64, output_size=2, dropout=0.2):
        super().__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers=2, batch_first=True, dropout=dropout)
        self.fc = nn.Linear(hidden_size, output_size)

    def forward(self, x):
        output, _ = self.lstm(x)
        return self.fc(output[:, -1, :])


def main() -> None:
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dataset_path = os.path.join(base_dir, "dataset", "polar_station.csv")
    model_path = os.path.join(base_dir, "models", "lstm_model.pt")
    scaler_path = os.path.join(base_dir, "models", "lstm_scaler.pkl")
    df = pd.read_csv(dataset_path)
    df["renewable_total"] = df["wind_gen_output"] + df["solar_gen_output"]

    input_scaler = MinMaxScaler()
    target_scaler = MinMaxScaler()
    inputs = input_scaler.fit_transform(df[INPUT_COLUMNS]).astype(np.float32)
    targets = target_scaler.fit_transform(df[TARGET_COLUMNS]).astype(np.float32)
    x_values, y_values = [], []
    for index in range(len(df) - SEQ_LEN):
        x_values.append(inputs[index:index + SEQ_LEN])
        y_values.append(targets[index + SEQ_LEN])

    dataset = TensorDataset(torch.tensor(x_values), torch.tensor(y_values))
    loader = DataLoader(dataset, batch_size=128, shuffle=True)
    model = LSTMModel()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    loss_function = nn.MSELoss()

    for epoch in range(1, 31):
        model.train()
        epoch_loss = 0.0
        for batch_x, batch_y in loader:
            optimizer.zero_grad()
            loss = loss_function(model(batch_x), batch_y)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            epoch_loss += loss.item()
        if epoch == 1 or epoch % 5 == 0:
            print(f"Epoch {epoch:2d}/30 | Loss: {epoch_loss / len(loader):.6f}")

    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    torch.save(model.state_dict(), model_path)
    joblib.dump({"input": input_scaler, "target": target_scaler}, scaler_path)
    print(f"Fuel/renewable LSTM saved to: {model_path}")


if __name__ == "__main__":
    main()
