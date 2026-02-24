import pandas as pd
import joblib
from xgboost import XGBRegressor

df = pd.read_csv("../dataset/uk_dale.csv")

df["hour"] = pd.to_datetime(df["timestamp"]).dt.hour

X = df[["aggregate", "hour"]]
y = df["aggregate"].shift(-1).fillna(method="ffill")

model = XGBRegressor()
model.fit(X, y)

joblib.dump(model, "../models/gb_model.pkl")
print("GB model saved.")
