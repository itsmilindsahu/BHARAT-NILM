"""Train a four-state weather and operational regime detector."""

import os

import joblib
import numpy as np
import pandas as pd
from hmmlearn import hmm
from sklearn.preprocessing import StandardScaler


REGIMES = ["calm", "storm", "polar-day", "polar-night"]
FEATURES = ["wind_speed", "ambient_temp", "daylight_hours", "aggregate", "is_extreme_event"]


def regime_label(row: pd.Series) -> str:
    if row["is_extreme_event"] == 1 or row["wind_speed"] >= 18:
        return "storm"
    if row["daylight_hours"] >= 20:
        return "polar-day"
    if row["daylight_hours"] <= 1:
        return "polar-night"
    return "calm"


def main() -> None:
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dataset_path = os.path.join(base_dir, "dataset", "polar_station.csv")
    model_path = os.path.join(base_dir, "models", "hmm_model.pkl")
    df = pd.read_csv(dataset_path)
    df["regime_label"] = df.apply(regime_label, axis=1)

    scaler = StandardScaler()
    observations = scaler.fit_transform(df[FEATURES]).astype(np.float32)
    model = hmm.GaussianHMM(
        n_components=4, covariance_type="diag", n_iter=150,
        random_state=42, init_params="stmc",
    )
    model.fit(observations)
    states = model.predict(observations)
    state_labels = {}
    for state in range(model.n_components):
        members = df.loc[states == state, "regime_label"]
        state_labels[state] = members.mode().iloc[0] if not members.empty else "calm"

    print({label: sum(value == label for value in state_labels.values()) for label in REGIMES})
    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    joblib.dump({"model": model, "scaler": scaler, "features": FEATURES, "state_labels": state_labels}, model_path)
    print(f"Weather/operational HMM saved to: {model_path}")


if __name__ == "__main__":
    main()
