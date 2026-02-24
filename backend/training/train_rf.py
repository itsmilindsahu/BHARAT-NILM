"""
train_rf.py  —  Random Forest classifier for appliance NILM labelling
Features: aggregate, delta, hour, rolling_mean_5, rolling_std_5
"""
import os
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dataset_path = os.path.join(base_dir, "dataset", "uk_dale.csv")
model_path   = os.path.join(base_dir, "models", "rf_model.pkl")

print("Loading dataset...")
df = pd.read_csv(dataset_path)

df["delta"]        = df["aggregate"].diff().fillna(0)
df["hour"]         = pd.to_datetime(df["timestamp"]).dt.hour
df["roll_mean_5"]  = df["aggregate"].rolling(5, min_periods=1).mean()
df["roll_std_5"]   = df["aggregate"].rolling(5, min_periods=1).std().fillna(0)

FEATURES = ["aggregate", "delta", "hour", "roll_mean_5", "roll_std_5"]
X = df[FEATURES]
y = df["label"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print("Training Random Forest...")
model = RandomForestClassifier(
    n_estimators=150,
    max_depth=12,
    min_samples_leaf=3,
    n_jobs=-1,
    random_state=42,
)
model.fit(X_train, y_train)

print("\nEvaluation on test set:")
print(classification_report(y_test, model.predict(X_test)))

os.makedirs(os.path.dirname(model_path), exist_ok=True)
joblib.dump(model, model_path)
print(f"RF model saved to: {model_path}")