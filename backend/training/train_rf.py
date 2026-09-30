"""Train the operating-regime classifier for the polar station."""

import os

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split


FEATURES = [
    "aggregate", "ambient_temp", "wind_speed", "solar_irradiance",
    "daylight_hours", "battery_soc", "fuel_level", "is_extreme_event",
]
REGIMES = ["solar-available", "wind-available", "diesel-only", "emergency"]


def operating_regime(row: pd.Series) -> str:
    if int(row["is_extreme_event"]) == 1:
        return "emergency"
    if row["solar_gen_output"] >= 5 and row["solar_irradiance"] >= 20:
        return "solar-available"
    if row["wind_gen_output"] >= 5:
        return "wind-available"
    return "diesel-only"


def main() -> None:
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dataset_path = os.path.join(base_dir, "dataset", "polar_station.csv")
    model_path = os.path.join(base_dir, "models", "rf_model.pkl")
    df = pd.read_csv(dataset_path)
    df["operating_regime"] = df.apply(operating_regime, axis=1)

    x_train, x_test, y_train, y_test = train_test_split(
        df[FEATURES], df["operating_regime"], test_size=0.2,
        random_state=42, stratify=df["operating_regime"],
    )
    model = RandomForestClassifier(
        n_estimators=220, max_depth=14, min_samples_leaf=3,
        class_weight="balanced", n_jobs=-1, random_state=42,
    )
    model.fit(x_train, y_train)
    print(classification_report(y_test, model.predict(x_test), labels=REGIMES, zero_division=0))
    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    joblib.dump(model, model_path)
    print(f"Operating-regime model saved to: {model_path}")


if __name__ == "__main__":
    main()
