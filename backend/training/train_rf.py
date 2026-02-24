import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier

df = pd.read_csv("../dataset/uk_dale.csv")

# Basic engineered features
df["delta"] = df["aggregate"].diff().fillna(0)
df["hour"] = pd.to_datetime(df["timestamp"]).dt.hour

X = df[["aggregate", "delta", "hour"]]
y = df["label"]

model = RandomForestClassifier(n_estimators=100)
model.fit(X, y)

joblib.dump(model, "../models/rf_model.pkl")
print("RF model saved.")
