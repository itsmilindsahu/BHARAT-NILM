import pandas as pd
import joblib
from sklearn.linear_model import LogisticRegression
import os

print("Starting Logistic Regression training...")

# Absolute safe path resolution
base_dir = os.path.dirname(os.path.dirname(__file__))
dataset_path = os.path.join(base_dir, "dataset", "uk_dale.csv")

print("Dataset path:", dataset_path)

df = pd.read_csv(dataset_path)

print("Dataset loaded.")
print("Columns:", df.columns)
print("Rows:", len(df))

if len(df) == 0:
    raise ValueError("Dataset is empty.")

df["delta"] = df["aggregate"].diff().fillna(0)
df["anomaly"] = (abs(df["delta"]) > 800).astype(int)

X = df[["aggregate", "delta"]]
y = df["anomaly"]

print("Training model...")

model = LogisticRegression()
model.fit(X, y)

model_path = os.path.join(base_dir, "models", "logreg_model.pkl")
joblib.dump(model, model_path)

print("LogReg model saved at:", model_path)
