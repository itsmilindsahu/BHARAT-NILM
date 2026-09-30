"""Train an equipment and fault anomaly detector."""

import os

import joblib
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


FEATURES = [
    "aggregate", "ambient_temp", "wind_speed", "solar_irradiance",
    "daylight_hours", "battery_soc", "fuel_level", "fuel_consumption_rate",
    "is_extreme_event",
]


def main() -> None:
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dataset_path = os.path.join(base_dir, "dataset", "polar_station.csv")
    model_path = os.path.join(base_dir, "models", "logreg_model.pkl")
    df = pd.read_csv(dataset_path)
    df["delta_load"] = df["aggregate"].diff().fillna(0)
    df["renewable_total"] = df["wind_gen_output"] + df["solar_gen_output"]
    df["fault_target"] = (
        (df["is_extreme_event"] == 1)
        | (df["fuel_consumption_rate"] > df["diesel_genset_output"] * 0.35 + 8)
        | (df["battery_soc"] < 0.12)
        | (df["delta_load"].abs() > df["aggregate"].rolling(48, min_periods=4).std().fillna(0) * 4)
    ).astype(int)
    features = FEATURES + ["delta_load", "renewable_total"]

    x_train, x_test, y_train, y_test = train_test_split(
        df[features], df["fault_target"], test_size=0.2,
        random_state=42, stratify=df["fault_target"],
    )
    model = Pipeline([
        ("scaler", StandardScaler()),
        ("classifier", LogisticRegression(class_weight="balanced", max_iter=700)),
    ])
    model.fit(x_train, y_train)
    print(classification_report(y_test, model.predict(x_test), zero_division=0))
    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    joblib.dump({"model": model, "features": features}, model_path)
    print(f"Equipment/fault anomaly model saved to: {model_path}")


if __name__ == "__main__":
    main()
