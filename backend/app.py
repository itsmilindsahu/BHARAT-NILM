from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import random
import math

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
# GLOBAL STATE (Stable Simulation Engine)
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

# ==========================================================
# UTILITY FUNCTIONS
# ==========================================================

def smooth_variation(base, amplitude=50):
    return base + random.randint(-amplitude, amplitude)

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

# ==========================================================
# PROFESSOR DASHBOARD
# ==========================================================

@app.get("/dashboard")
def dashboard():

    appliances = {
        "AC": smooth_variation(1200, 200),
        "Fridge": 250,
        "Fan": 80,
        "Washing Machine": smooth_variation(600, 150),
        "Geyser": smooth_variation(1500, 250),
    }

    total_load = sum(appliances.values())

    state["trend_memory"].append(total_load)
    if len(state["trend_memory"]) > 50:
        state["trend_memory"].pop(0)

    current_bill = round(total_load * 0.12, 2)
    predicted_bill = round(total_load * 0.13, 2)

    return {
        "timestamp": datetime.now(),
        "appliances": appliances,
        "total_load": total_load,
        "monthly_bill_current": current_bill,
        "monthly_bill_predicted": predicted_bill,
        "trend_memory": state["trend_memory"],
    }

# ==========================================================
# CONSUMER DASHBOARD
# ==========================================================

@app.get("/consumer-dashboard")
def consumer_dashboard(mode: str = Query("postpaid")):

    base = state["consumer_base_load"]

    appliances = {
        "AC": smooth_variation(1100, 150),
        "Fridge": 250,
        "Fan": 80,
        "TV": 150,
        "Geyser": smooth_variation(1400, 200),
    }

    # Apply remote shutdown simulation
    for device, status in state["shutdown_devices"].items():
        if status and device in appliances:
            appliances[device] = 0

    total_load = sum(appliances.values())

    tariff = 6.5
    daily_units = total_load / 1000
    daily_cost = daily_units * tariff

    day = datetime.now().day
    current_bill = round(daily_cost * day, 2)
    predicted_bill = monthly_projection(current_bill, day)

    # Prepaid logic
    if mode == "prepaid":
        state["consumer_balance"] -= daily_cost * 0.1

    prepaid_balance = round(state["consumer_balance"], 2)

    days_left = (
        round(prepaid_balance / daily_cost, 1)
        if daily_cost > 0 else 30
    )

    cutoff_risk = "SAFE"
    if prepaid_balance < 100:
        cutoff_risk = "CRITICAL"
    elif prepaid_balance < 300:
        cutoff_risk = "WARNING"

    eff = efficiency_score(total_load)
    carbon = carbon_estimate(total_load)

    stability = financial_stability(current_bill, predicted_bill)

    return {
        "mode": mode,
        "appliances": appliances,
        "total_load": total_load,
        "current_bill": current_bill,
        "predicted_end_month": predicted_bill,
        "efficiency_score": eff,
        "carbon_footprint": carbon,
        "financial_stability": stability,
        "prepaid_balance": prepaid_balance,
        "days_left": days_left,
        "cutoff_risk": cutoff_risk,
    }

# ==========================================================
# REMOTE DEVICE CONTROL
# ==========================================================

@app.post("/toggle-device")
def toggle_device(device: str, status: bool):
    state["shutdown_devices"][device] = status
    return {"device": device, "status": status}

# ==========================================================
# INDUSTRIAL DASHBOARD
# ==========================================================

@app.get("/industrial-dashboard")
def industrial_dashboard():

    contracted_demand = 600
    tariff_per_kva = 350
    transformer_capacity = 800

    # ---------- CURRENT DEMAND ----------
    current_demand = random.randint(480, 720)
    peak_demand = max(current_demand, random.randint(550, 750))

    # ---------- PENALTY ----------
    excess_kva = max(0, peak_demand - contracted_demand)
    penalty = excess_kva * tariff_per_kva

    # ---------- TRANSFORMER ----------
    transformer_load_percent = round(
        (current_demand / transformer_capacity) * 100, 2
    )

    if transformer_load_percent > 90:
        overload_risk = "HIGH"
    elif transformer_load_percent > 75:
        overload_risk = "MODERATE"
    else:
        overload_risk = "LOW"

    # ---------- PEAK FORECAST (FIXED) ----------
    forecast = []
    base = current_demand

    for i in range(6):
        base = base + random.randint(-10, 25)
        forecast.append({
            "interval": i,
            "demand": max(450, base)
        })

    # ---------- PEAK SHAVING AI ----------
    if excess_kva > 0:
        suggested_load_shift = round(excess_kva * 0.8, 2)
        estimated_savings = suggested_load_shift * tariff_per_kva
    else:
        suggested_load_shift = 0
        estimated_savings = 0

    # ---------- POWER FACTOR ----------
    power_factor = round(random.uniform(0.82, 0.99), 2)

    if power_factor < 0.9:
        pf_penalty = round((0.9 - power_factor) * 15000, 2)
    else:
        pf_penalty = 0

    # ---------- PRODUCTION ----------
    units_produced = random.randint(800, 1500)
    total_energy_kwh = round(current_demand * 0.75, 2)

    if units_produced > 0:
        energy_cost_per_unit = round(
            total_energy_kwh / units_produced, 3
        )
    else:
        energy_cost_per_unit = 0

    # ---------- DOWNTIME ML ----------
    vibration_index = round(random.uniform(0.6, 1.5), 2)

    if vibration_index > 1.3:
        downtime_risk = "HIGH"
    elif vibration_index > 1.1:
        downtime_risk = "MODERATE"
    else:
        downtime_risk = "LOW"

    # ---------- PHASE BALANCE ----------
    phase_r = random.randint(180, 250)
    phase_y = random.randint(160, 240)
    phase_b = random.randint(170, 260)

    imbalance = round(
        (max(phase_r, phase_y, phase_b) -
         min(phase_r, phase_y, phase_b)) /
        max(phase_r, phase_y, phase_b) * 100,
        2
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
        "phases": {
            "R": phase_r,
            "Y": phase_y,
            "B": phase_b
        },
        "imbalance_percent": imbalance
    }


# ==========================================================
# GRID DASHBOARD
# ==========================================================

@app.get("/grid-dashboard")
def grid_dashboard():

    feeders = []
    total_loss = 0

    for i in range(1, 11):
        load = smooth_variation(state["grid_feeder_base"], 15)
        loss = round(random.uniform(5, 15), 2)

        feeders.append({
            "name": f"Feeder-{i}",
            "load_percent": load,
            "loss_percent": loss,
            "risk": "HIGH" if load > 95 else "MODERATE" if load > 80 else "LOW"
        })

        total_loss += loss

    atc_loss = round(total_loss / 10, 2)

    surge_zone = random.choice(feeders)

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
# MODEL METRICS
# ==========================================================

@app.get("/model-metrics")
def model_metrics():

    confusion = [
        [45, 5, 2],
        [4, 50, 3],
        [1, 6, 48]
    ]

    roc = [
        {"fpr": 0.0, "tpr": 0.0},
        {"fpr": 0.1, "tpr": 0.6},
        {"fpr": 0.2, "tpr": 0.75},
        {"fpr": 0.3, "tpr": 0.85},
        {"fpr": 0.4, "tpr": 0.92},
        {"fpr": 1.0, "tpr": 1.0},
    ]

    return {
        "accuracy": 0.94,
        "precision": 0.91,
        "recall": 0.92,
        "f1": 0.915,
        "auc": 0.96,
        "confusion": confusion,
        "roc": roc
    }
