# --------- WINDOWS OPENMP FIX ---------
import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

# --------- IMPORTS ---------
import torch
import torch.nn as nn
import pandas as pd
import numpy as np

# --------- LSTM MODEL DEFINITION ---------
class LSTMModel(nn.Module):
    def __init__(self, input_size=1, hidden_size=64):
        super().__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, batch_first=True)
        self.fc = nn.Linear(hidden_size, 1)

    def forward(self, x):
        out, _ = self.lstm(x)
        out = self.fc(out[:, -1, :])
        return out


# --------- MAIN TRAINING FUNCTION ---------
def main():

    print("Starting LSTM training...")

    # Safe absolute dataset path
    base_dir = os.path.dirname(os.path.dirname(__file__))
    dataset_path = os.path.join(base_dir, "dataset", "uk_dale.csv")
    model_path = os.path.join(base_dir, "models", "lstm_model.pt")

    print("Loading dataset from:", dataset_path)

    df = pd.read_csv(dataset_path)

    if len(df) < 30:
        raise ValueError("Dataset too small for LSTM training.")

    data = df["aggregate"].values.astype(np.float32)

    seq_len = 24
    X, y = [], []

    for i in range(len(data) - seq_len):
        X.append(data[i:i+seq_len])
        y.append(data[i+seq_len])

    X = torch.tensor(X).unsqueeze(-1)
    y = torch.tensor(y).unsqueeze(-1)

    print("Dataset prepared. Training samples:", len(X))

    model = LSTMModel()
    criterion = nn.MSELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)

    epochs = 20

    for epoch in range(epochs):
        optimizer.zero_grad()
        output = model(X)
        loss = criterion(output, y)
        loss.backward()
        optimizer.step()

        print(f"Epoch {epoch+1}/{epochs} | Loss: {loss.item():.4f}")

    torch.save(model.state_dict(), model_path)

    print("LSTM model saved at:", model_path)


if __name__ == "__main__":
    main()
