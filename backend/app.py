from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
import random
import math
import os

from inference_engine import InferenceEngine

app = FastAPI()

# ==========================================================
# CORS
# ==========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================================
# BOOT: Load ML models once at startup
# ==========================================================

engine = InferenceEngine()

# ==========================================================
# GLOBAL STATE
# ==========================================================

state = {
    "consumer_balance": 1500.0,
    "consumer_base_load": 2200,
    "industrial_base_demand": 540,
    "contracted_demand": 600,
    "grid_feeder_base": 85,
    "shutdown_devices": {},
    "trend_memory": [],
}

# NILM appliance base wattages (used for realistic simulation)
APPLIANCE_BASE = {
    "AC": 1200,
    "Fridge": 250,
    "Fan": 80,
    "Washing Machine": 600,
    "Geyser": 1500,
    "TV": 150,
}

# ==========================================================
# UTILITY FUNCTIONS
# ==========================================================

def smooth_variation(base, amplitude=50):
    return max(0, base + random.randint(-amplitude, amplitude))

def efficiency_score(load):
    return max(40, round(100 - (load / 50), 2))

def carbon_estimate(load):
    return round(load * 0.0007, 2)

def monthly_projection(current_bill, day):
    if day == 0:
        return 0
    return round((current_bill / day) * 30, 2)

def financial_stability(current, predicted):
    diff = abs(predicted - current)
    return max(50, round(100 - (diff / 50), 2))

def build_appliances_from_ml(ml_result: dict, appliance_set: list) -> dict:
    """
    Use ML outputs to distribute aggregate load across appliances.
    - rf_label  → which appliance is dominant right now
    - hmm_state → 0=low-usage mode, 1=high-usage mode
    - anomaly_score → if high, spike one appliance
    """
    label = ml_result.get("rf_label", "fan")
    hmm_state = ml_result.get("hmm_state", 0)
    anomaly = ml_result.get("anomaly_score", 0.0)
    aggregate = ml_result.get("aggregate", 2000)

    appliances = {}
    for name in appliance_set:
        base = APPLIANCE_BASE.get(name, 200)
        # Scale by HMM state: state 1 = high consumption mode
        scale = 1.2 if hmm_state == 1 else 0.85
        appliances[name] = smooth_variation(int(base * scale), 60)

    # Dominant appliance from RF classifier gets boosted to match aggregate
    if label in appliances:
        appliances[label] = max(appliances[label], int(aggregate * 0.55))

    # Anomaly spike: if anomaly_score > 0.7, reflect a consumption spike
    if anomaly > 0.7 and label in appliances:
        appliances[label] = int(appliances[label] * 1.35)

    return appliances

# ==========================================================
# PROFESSOR DASHBOARD
# ==========================================================

@app.get("/dashboard")
def dashboard():
    now = datetime.now()
    hour = now.hour

    # Simulate a realistic aggregate reading for this hour
    base_aggregate = 2200 if (6 <= hour <= 9 or 18 <= hour <= 23) else 900
    aggregate = smooth_variation(base_aggregate, 200)

    # Run through ML engine
    ml = engine.predict(aggregate, now.isoformat())

    appliances = build_appliances_from_ml(
        ml,
        ["AC", "Fridge", "Fan", "Washing Machine", "Geyser"]
    )

    total_load = sum(appliances.values())

    state["trend_memory"].append(total_load)
    if len(state["trend_memory"]) > 50:
        state["trend_memory"].pop(0)

    current_bill = round(total_load * 0.12, 2)
    predicted_bill = round(ml["lstm_forecast"] * 0.12, 2) if ml["lstm_forecast"] > 0 else round(total_load * 0.13, 2)

    return {
        "timestamp": now,
        "appliances": appliances,
        "total_load": total_load,
        "monthly_bill_current": current_bill,
        "monthly_bill_predicted": predicted_bill,
        "trend_memory": state["trend_memory"],
        # ML insights exposed to frontend
        "ml": {
            "dominant_appliance": ml["rf_label"],
            "rf_confidence": round(ml["rf_confidence"] * 100, 1),
            "anomaly_score": round(ml["anomaly_score"] * 100, 1),
            "hmm_state": "High Usage" if ml["hmm_state"] == 1 else "Low Usage",
            "lstm_forecast_w": round(ml["lstm_forecast"], 1),
            "next_hour_usage_kwh": round(ml["gb_usage_next"] / 1000, 3),
        }
    }

# ==========================================================
# CONSUMER DASHBOARD
# ==========================================================

@app.get("/consumer-dashboard")
def consumer_dashboard(mode: str = Query("postpaid")):
    now = datetime.now()
    hour = now.hour

    base_aggregate = 1800 if (18 <= hour <= 23) else 800
    aggregate = smooth_variation(base_aggregate, 150)

    ml = engine.predict(aggregate, now.isoformat())

    appliances = build_appliances_from_ml(
        ml,
        ["AC", "Fridge", "Fan", "TV", "Geyser"]
    )

    # Apply remote shutdown
    for device, is_off in state["shutdown_devices"].items():
        if is_off and device in appliances:
            appliances[device] = 0

    total_load = sum(appliances.values())

    tariff = 6.5
    daily_units = total_load / 1000
    daily_cost = daily_units * tariff

    day = now.day
    current_bill = round(daily_cost * day, 2)
    predicted_bill = monthly_projection(current_bill, day)

    if mode == "prepaid":
        state["consumer_balance"] -= daily_cost * 0.1

    prepaid_balance = round(state["consumer_balance"], 2)
    days_left = round(prepaid_balance / daily_cost, 1) if daily_cost > 0 else 30

    if prepaid_balance < 100:
        cutoff_risk = "CRITICAL"
    elif prepaid_balance < 300:
        cutoff_risk = "WARNING"
    else:
        cutoff_risk = "SAFE"

    return {
        "mode": mode,
        "appliances": appliances,
        "total_load": total_load,
        "current_bill": current_bill,
        "predicted_end_month": predicted_bill,
        "efficiency_score": efficiency_score(total_load),
        "carbon_footprint": carbon_estimate(total_load),
        "financial_stability": financial_stability(current_bill, predicted_bill),
        "prepaid_balance": prepaid_balance,
        "days_left": days_left,
        "cutoff_risk": cutoff_risk,
        "ml": {
            "dominant_appliance": ml["rf_label"],
            "rf_confidence": round(ml["rf_confidence"] * 100, 1),
            "anomaly_score": round(ml["anomaly_score"] * 100, 1),
            "hmm_state": "High Usage" if ml["hmm_state"] == 1 else "Low Usage",
            "lstm_forecast_w": round(ml["lstm_forecast"], 1),
        }
    }

# ==========================================================
# REMOTE DEVICE CONTROL
# ==========================================================

class DeviceToggle(BaseModel):
    device: str
    status: bool

@app.post("/toggle-device")
def toggle_device(body: DeviceToggle):
    state["shutdown_devices"][body.device] = body.status
    return {"device": body.device, "status": body.status}

# ==========================================================
# NILM PREDICT  (direct ML endpoint)
# ==========================================================

class NilmRequest(BaseModel):
    aggregate: float
    timestamp: str = None

@app.post("/nilm-predict")
def nilm_predict(body: NilmRequest):
    ts = body.timestamp or datetime.now().isoformat()
    result = engine.predict(body.aggregate, ts)
    return result

# ==========================================================
# INDUSTRIAL DASHBOARD
# ==========================================================

@app.get("/industrial-dashboard")
def industrial_dashboard():
    now = datetime.now()

    contracted_demand = 600
    tariff_per_kva = 350
    transformer_capacity = 800

    # Use ML engine with industrial-scale aggregate
    aggregate = smooth_variation(560, 120)
    ml = engine.predict(aggregate, now.isoformat())

    current_demand = int(aggregate)
    peak_demand = max(current_demand, smooth_variation(current_demand, 80))

    excess_kva = max(0, peak_demand - contracted_demand)
    penalty = excess_kva * tariff_per_kva

    transformer_load_percent = round((current_demand / transformer_capacity) * 100, 2)

    if transformer_load_percent > 90:
        overload_risk = "HIGH"
    elif transformer_load_percent > 75:
        overload_risk = "MODERATE"
    else:
        overload_risk = "LOW"

    # LSTM-guided forecast: use lstm_forecast as the next-interval anchor
    forecast = []
    base = current_demand
    lstm_anchor = ml["lstm_forecast"] if ml["lstm_forecast"] > 0 else current_demand

    for i in range(6):
        # Blend random walk with LSTM prediction
        blend = base * 0.4 + lstm_anchor * 0.6
        base = blend + random.randint(-15, 20)
        forecast.append({
            "interval": i,
            "demand": round(max(450, base), 1)
        })

    if excess_kva > 0:
        suggested_load_shift = round(excess_kva * 0.8, 2)
        estimated_savings = round(suggested_load_shift * tariff_per_kva, 2)
    else:
        suggested_load_shift = 0
        estimated_savings = 0

    power_factor = round(random.uniform(0.82, 0.99), 2)
    pf_penalty = round((0.9 - power_factor) * 15000, 2) if power_factor < 0.9 else 0

    units_produced = random.randint(800, 1500)
    total_energy_kwh = round(current_demand * 0.75, 2)
    energy_cost_per_unit = round(total_energy_kwh / units_produced, 3) if units_produced > 0 else 0

    # Use anomaly_score from ML to drive downtime risk
    anomaly = ml["anomaly_score"]
    if anomaly > 0.7:
        downtime_risk = "HIGH"
    elif anomaly > 0.4:
        downtime_risk = "MODERATE"
    else:
        downtime_risk = "LOW"

    vibration_index = round(0.6 + anomaly * 0.9, 2)

    phase_r = random.randint(180, 250)
    phase_y = random.randint(160, 240)
    phase_b = random.randint(170, 260)
    imbalance = round(
        (max(phase_r, phase_y, phase_b) - min(phase_r, phase_y, phase_b)) /
        max(phase_r, phase_y, phase_b) * 100, 2
    )

    return {
        "contracted_demand": contracted_demand,
        "current_demand": current_demand,
        "peak_demand": peak_demand,
        "excess_kva": excess_kva,
        "penalty": penalty,
        "forecast": forecast,
        "power_factor": power_factor,
        "pf_penalty": pf_penalty,
        "transformer_load_percent": transformer_load_percent,
        "overload_risk": overload_risk,
        "suggested_load_shift": suggested_load_shift,
        "estimated_savings": estimated_savings,
        "units_produced": units_produced,
        "energy_cost_per_unit": energy_cost_per_unit,
        "downtime_risk": downtime_risk,
        "vibration_index": vibration_index,
        "phases": {"R": phase_r, "Y": phase_y, "B": phase_b},
        "imbalance_percent": imbalance,
        "ml": {
            "anomaly_score": round(anomaly * 100, 1),
            "hmm_state": "High Load" if ml["hmm_state"] == 1 else "Normal Load",
            "lstm_next_kw": round(ml["lstm_forecast"] / 1000, 2),
        }
    }

# ==========================================================
# GRID DASHBOARD
# ==========================================================

@app.get("/grid-dashboard")
def grid_dashboard():
    now = datetime.now()

    feeders = []
    total_loss = 0

    for i in range(1, 11):
        feeder_aggregate = smooth_variation(state["grid_feeder_base"] * 22, 300)
        ml = engine.predict(feeder_aggregate, now.isoformat())

        load = smooth_variation(state["grid_feeder_base"], 15)
        loss = round(random.uniform(5, 15), 2)

        # Anomaly from ML elevates risk assessment
        anomaly = ml["anomaly_score"]
        if load > 95 or anomaly > 0.7:
            risk = "HIGH"
        elif load > 80 or anomaly > 0.4:
            risk = "MODERATE"
        else:
            risk = "LOW"

        feeders.append({
            "name": f"Feeder-{i}",
            "load_percent": load,
            "loss_percent": loss,
            "risk": risk,
            "anomaly_score": round(anomaly * 100, 1),
        })

        total_loss += loss

    atc_loss = round(total_loss / 10, 2)
    surge_zone = max(feeders, key=lambda f: f["load_percent"])

    return {
        "feeders": feeders,
        "avg_atc_loss": atc_loss,
        "surge_zone": surge_zone["name"],
        "intervention": [
            f"Targeted AC replacement in {surge_zone['name']}",
            "Incentivize off-peak usage 7PM–10PM"
        ]
    }

# ==========================================================
# MODEL METRICS  (real evaluation against dataset)
# ==========================================================

@app.get("/model-metrics")
def model_metrics():
    import pandas as pd
    import numpy as np
    from sklearn.metrics import (
        accuracy_score, precision_score,
        recall_score, f1_score, confusion_matrix, roc_curve, auc
    )
    from sklearn.preprocessing import label_binarize

    base_dir = os.path.dirname(__file__)
    dataset_path = os.path.join(base_dir, "dataset", "uk_dale.csv")

    if not os.path.exists(dataset_path):
        return {"error": "Dataset not found. Run generate_dataset.py first."}

    df = pd.read_csv(dataset_path)
    df["delta"] = df["aggregate"].diff().fillna(0)
    df["hour"] = pd.to_datetime(df["timestamp"]).dt.hour

    X = df[["aggregate", "delta", "hour"]]
    y_true = df["label"]

    y_pred = engine.rf.predict(X)
    y_proba = engine.rf.predict_proba(X)

    classes = list(engine.rf.classes_)
    cm = confusion_matrix(y_true, y_pred, labels=classes).tolist()

    acc = round(accuracy_score(y_true, y_pred), 4)
    prec = round(precision_score(y_true, y_pred, average="weighted", zero_division=0), 4)
    rec = round(recall_score(y_true, y_pred, average="weighted", zero_division=0), 4)
    f1 = round(f1_score(y_true, y_pred, average="weighted", zero_division=0), 4)

    # ROC (macro OvR)
    y_bin = label_binarize(y_true, classes=classes)
    roc_points = []
    auc_scores = []

    for i in range(len(classes)):
        if y_bin[:, i].sum() == 0:
            continue
        fpr, tpr, _ = roc_curve(y_bin[:, i], y_proba[:, i])
        auc_val = auc(fpr, tpr)
        auc_scores.append(auc_val)
        # Downsample to 10 points for frontend
        idx = np.linspace(0, len(fpr) - 1, min(10, len(fpr)), dtype=int)
        for j in idx:
            roc_points.append({
                "class": classes[i],
                "fpr": round(float(fpr[j]), 3),
                "tpr": round(float(tpr[j]), 3),
            })

    mean_auc = round(float(np.mean(auc_scores)), 4) if auc_scores else 0.0

    return {
        "accuracy": acc,
        "precision": prec,
        "recall": rec,
        "f1": f1,
        "auc": mean_auc,
        "classes": classes,
        "confusion": cm,
        "roc": roc_points,
    }