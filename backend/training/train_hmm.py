"""
train_hmm.py  —  Gaussian HMM for consumption regime detection
States: 0 = low-load regime, 1 = high-load regime
3 components gives better separation of standby / normal / peak.
"""
import os
import pandas as pd
import numpy as np
import joblib
from hmmlearn import hmm

base_dir     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dataset_path = os.path.join(base_dir, "dataset", "uk_dale.csv")
model_path   = os.path.join(base_dir, "models", "hmm_model.pkl")

print("Loading dataset...")
df = pd.read_csv(dataset_path)

data = df["aggregate"].values.reshape(-1, 1).astype(np.float32)

print("Training HMM (3 states: standby / normal / peak)...")
model = hmm.GaussianHMM(
    n_components=3,
    covariance_type="diag",
    n_iter=100,
    random_state=42,
)
model.fit(data)

states = model.predict(data)
print(f"State distribution: { {i: int((states==i).sum()) for i in range(3)} }")

# Label states by mean emission so state 0 < state 1 < state 2
means = model.means_.flatten()
print(f"State means (W): {sorted(means)}")

os.makedirs(os.path.dirname(model_path), exist_ok=True)
joblib.dump(model, model_path)
print(f"HMM model saved to: {model_path}")