"""
train_logreg.py  —  Logistic Regression anomaly detector
Anomaly = abs(delta) > 800W  (sudden spike/drop)
Now also uses rolling_std as a feature for better sensitivity.
"""
import os
import pandas as pd
import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

base_dir     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dataset_path = os.path.join(base_dir, "dataset", "uk_dale.csv")
model_path   = os.path.join(base_dir, "models", "logreg_model.pkl")

print("Loading dataset...")
df = pd.read_csv(dataset_path)

if len(df) == 0:
    raise ValueError("Dataset is empty. Run generate_dataset.py first.")

df["delta"]       = df["aggregate"].diff().fillna(0)
df["roll_std_5"]  = df["aggregate"].rolling(5, min_periods=1).std().fillna(0)

# Use dataset's own anomaly column if available, else derive it
if "is_anomaly" in df.columns:
    df["anomaly"] = df["is_anomaly"]
else:
    df["anomaly"] = (abs(df["delta"]) > 800).astype(int)

print(f"Anomaly rate: {df['anomaly'].mean()*100:.1f}%")

FEATURES = ["aggregate", "delta", "roll_std_5"]
X = df[FEATURES]
y = df["anomaly"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# Pipeline: scale → logistic regression
pipe = Pipeline([
    ("scaler", StandardScaler()),
    ("clf", LogisticRegression(class_weight="balanced", max_iter=500)),
])

print("Training Logistic Regression anomaly detector...")
pipe.fit(X_train, y_train)

print("\nEvaluation:")
print(classification_report(y_test, pipe.predict(X_test)))

os.makedirs(os.path.dirname(model_path), exist_ok=True)
joblib.dump(pipe, model_path)
print(f"LogReg model saved to: {model_path}")