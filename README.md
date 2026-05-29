# Bharat-NILM — Non-Intrusive Load Monitoring & Smart Energy Disaggregation

> **Award:** 3rd Prize — IIES Energy Analytics Challenge 2025 (National: IISERs, IISc, NISER, CEBS)

![Python](https://img.shields.io/badge/python-3.10%2B-blue?style=flat-square)
![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688?style=flat-square&logo=fastapi)
![PyTorch](https://img.shields.io/badge/PyTorch-LSTM-EE4C2C?style=flat-square&logo=pytorch)
![Docker](https://img.shields.io/badge/Docker-containerised-2496ED?style=flat-square&logo=docker)

An end-to-end smart energy disaggregation system that identifies **which appliances are running** from a single whole-home power signal — no per-device sensors required. Built as a full-stack ML system with a real-time inference backend, WebSocket-powered dashboard, and a containerised deployment pipeline.

---

## Problem

Traditional energy monitoring tells you total consumption. NILM answers the harder question: *which appliances are responsible, and when?* This enables targeted energy savings without requiring smart plugs on every device.

---

## System Architecture

```
ESP32 Smart Plug / Sensor
        │  (simulated WebSocket stream)
        ▼
┌─────────────────────────────────┐
│     FastAPI Backend (app.py)     │
│  ┌────────────────────────────┐ │
│  │     InferenceEngine         │ │
│  │  ┌──────────┐ ┌─────────┐  │ │
│  │  │  Random  │ │  LSTM   │  │ │
│  │  │  Forest  │ │ (PyTorch│  │ │
│  │  │ Anomaly  │ │ seq=20) │  │ │
│  │  │ Detector │ │ scaler  │  │ │
│  │  └──────────┘ └─────────┘  │ │
│  └────────────────────────────┘ │
│  WebSocket /ws endpoint          │
└──────────────┬──────────────────┘
               │  JSON events
               ▼
┌──────────────────────────────────┐
│   Frontend Dashboard (JS/HTML)   │
│   Real-time charts, appliance    │
│   breakdown, anomaly alerts      │
└──────────────────────────────────┘
```

---

## ML Pipeline

### Inference Engine (`backend/inference_engine.py`)
Thread-safe, dual-model inference:

- **Random Forest classifier** — anomaly detection on instantaneous power readings with rolling statistical features (`rolling_mean_5`, `rolling_std_5`)
- **LSTM (PyTorch)** — sequential load prediction over a 20-step sliding window; model weights and scaler persisted via `joblib` for zero re-training on restart
- Graceful fallback to RF-only if LSTM sequence buffer not yet filled

### Feature Engineering
```python
features = [
    raw_power,
    rolling_mean_5,   # 5-sample rolling mean
    rolling_std_5,    # 5-sample rolling std dev
    delta_power,      # first-order difference
]
```

### Backend (`backend/app.py`)
- FastAPI + CORS middleware
- ML models loaded once at startup via `InferenceEngine()`
- WebSocket endpoint streams predictions at sensor frequency
- REST endpoints for historical queries

### Dashboard (`dashboard/`)
- FastAPI serves static frontend + WebSocket
- Simulates ESP32 smart plug data stream
- Live appliance-level power breakdown
- Deployable to Fly.io / Railway

---

## Deployment

```bash
# Docker (recommended)
docker build -t bharat-nilm .
docker run -p 8000:8000 bharat-nilm

# Local
pip install fastapi uvicorn torch joblib scikit-learn numpy pandas
uvicorn backend.app:app --reload
```

---

## Repository Structure

```
BHARAT-NILM/
├── backend/
│   ├── app.py               # FastAPI server + REST + WebSocket
│   ├── inference_engine.py  # Thread-safe dual-model inference
│   └── train_lstm.py        # LSTM training script
├── dashboard/               # Merged from bharat-nilm-dashboard
│   ├── app.py               # Dashboard server (Fly.io ready)
│   ├── frontend/            # HTML/CSS/JS real-time UI
│   └── Dockerfile
└── Dockerfile               # Production container
```
