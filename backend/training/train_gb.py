"""
train_gb.py  —  XGBoost regressor for next-interval aggregate consumption
Predicts: aggregate at t+1 given current features
"""
import os
import pandas as pd
import joblib
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

base_dir    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dataset_path = os.path.join(base_dir, "dataset", "uk_dale.csv")
model_path   = os.path.join(base_dir, "models", "gb_model.pkl")

print("Loading dataset...")
df = pd.read_csv(dataset_path)

df["delta"]        = df["aggregate"].diff().fillna(0)
df["hour"]         = pd.to_datetime(df["timestamp"]).dt.hour
df["roll_mean_5"]  = df["aggregate"].rolling(5, min_periods=1).mean()
df["roll_std_5"]   = df["aggregate"].rolling(5, min_periods=1).std().fillna(0)
df["target"]       = df["aggregate"].shift(-1)
df = df.dropna(subset=["target"])

FEATURES = ["aggregate", "delta", "hour", "roll_mean_5", "roll_std_5"]
X = df[FEATURES]
y = df["target"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

print("Training XGBoost...")
model = XGBRegressor(
    n_estimators=200,
    max_depth=6,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    random_state=42,
    n_jobs=-1,
)
model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

preds = model.predict(X_test)
print(f"MAE:  {mean_absolute_error(y_test, preds):.2f} W")
print(f"R²:   {r2_score(y_test, preds):.4f}")

os.makedirs(os.path.dirname(model_path), exist_ok=True)
joblib.dump(model, model_path)
print(f"GB model saved to: {model_path}")