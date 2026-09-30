"""Train a weather-aware next-step load and renewable-output forecaster."""

import os

import joblib
import pandas as pd
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.multioutput import MultiOutputRegressor
from sklearn.model_selection import train_test_split
from xgboost import XGBRegressor


FEATURES = [
    "aggregate", "ambient_temp", "wind_speed", "solar_irradiance",
    "daylight_hours", "battery_soc", "fuel_level", "is_extreme_event",
]
TARGETS = ["aggregate", "wind_gen_output", "solar_gen_output"]


def main() -> None:
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dataset_path = os.path.join(base_dir, "dataset", "polar_station.csv")
    model_path = os.path.join(base_dir, "models", "gb_model.pkl")
    df = pd.read_csv(dataset_path)
    df["target_load"] = df["aggregate"].shift(-1)
    df["target_wind"] = df["wind_gen_output"].shift(-1)
    df["target_solar"] = df["solar_gen_output"].shift(-1)
    df = df.dropna(subset=["target_load", "target_wind", "target_solar"])

    targets = ["target_load", "target_wind", "target_solar"]
    x_train, x_test, y_train, y_test = train_test_split(
        df[FEATURES], df[targets], test_size=0.2, random_state=42,
    )
    estimator = XGBRegressor(
        n_estimators=260, max_depth=7, learning_rate=0.05,
        subsample=0.85, colsample_bytree=0.9, objective="reg:squarederror",
        n_jobs=-1, random_state=42,
    )
    model = MultiOutputRegressor(estimator)
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)
    for index, target in enumerate(TARGETS):
        print(f"{target}: MAE={mean_absolute_error(y_test.iloc[:, index], predictions[:, index]):.3f}, "
              f"R2={r2_score(y_test.iloc[:, index], predictions[:, index]):.4f}")

    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    joblib.dump({"model": model, "features": FEATURES, "targets": TARGETS}, model_path)
    print(f"Load and renewable forecaster saved to: {model_path}")


if __name__ == "__main__":
    main()
