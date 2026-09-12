# Bharat Energy AI

> AI-driven smart energy management for polar research stations

Bharat Energy AI is a FastAPI + Next.js research platform for MoES/NCPOR SIH
problem statement PS 26061. It helps remote polar stations keep life-support
loads reliable, coordinate wind, solar, battery, and diesel resources, plan
fuel logistics, and understand energy behavior during blizzards and whiteouts.

## Personas

| Persona | Primary workspace |
|---|---|
| Station Ops | Station health, critical loads, alarms, and extreme-event response |
| Renewable & Microgrid Manager | Renewable dispatch, battery state, diesel coordination, and forecasts |
| Fuel & Logistics Officer | Fuel runway, consumption, resupply planning, and weather risk |
| Research/Admin | Model metrics, experiments, datasets, exports, and historical analysis |

## Architecture

The platform keeps the existing five-model structure:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Next.js station console                                               │
│ Station Ops | Renewable & Microgrid | Fuel & Logistics | Research     │
│ Live Playground: shared BLIZZARD / POLAR NIGHT simulation controls    │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ REST + Server-Sent Events
┌──────────────────────────────▼───────────────────────────────────────┐
│ FastAPI orchestration layer                                           │
│ /forecast-load /forecast-renewable /regime /anomaly /fuel-optimize    │
│ /station-dashboard /renewable-dashboard /fuel-dashboard /model-metrics │
└───────────────┬──────────────────────────┬───────────────────────────┘
                │                          │
   ┌────────────▼────────────┐  ┌────────▼───────────────────────────┐
   │ InferenceEngine         │  │ FuelOptimizer                       │
   │ RF · XGBoost · LogReg   │  │ SOC, genset, reserve, extreme event │
   │ HMM · LSTM              │  │ constrained dispatch each tick     │
   └────────────┬────────────┘  └─────────────────────────────────────┘
                │
   ┌────────────▼─────────────────────────────────────────────────────┐
   │ Polar telemetry: weather, daylight, station loads, renewables,   │
   │ battery, diesel, fuel, blizzard and whiteout event flags          │
   └───────────────────────────────────────────────────────────────────┘
```

- **Random Forest**: dominant station load-regime classification
- **XGBoost**: next-interval station demand forecast
- **Logistic Regression**: anomaly detection
- **Gaussian HMM**: standby, normal, and peak regime detection
- **LSTM**: sequence load forecasting

The detailed target architecture and migration plan are in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Repository

```text
backend/
├── app.py                 # FastAPI application and current API surface
├── inference_engine.py    # Five-model inference wrapper
├── replay.py              # Offline replay and audit tool
├── dataset/
│   └── polar_station.csv  # 17,520 rows, 30-minute station telemetry
├── models/                # Serialized model artifacts
└── training/              # Dataset generation and model training
frontend/
└── app/                   # Next.js dashboards and shared components
dashboard/                 # Supporting dashboard assets
```

## Polar-Stations Dataset

Run the generator from `backend/`:

```bash
python training/generate_dataset.py
```

It simulates one year at 30-minute resolution with seasonal and weather-driven
behavior, including polar day and polar night. The dataset contains:

- Environment: `ambient_temp`, `wind_speed`, `solar_irradiance`, `daylight_hours`
- Loads: `heating`, `life_support`, `labs`, `comms`, `lighting`, `kitchen`
- Supply: `diesel_genset_output`, `wind_gen_output`, `solar_gen_output`
- Storage and fuel: `battery_soc`, `fuel_level`, `fuel_consumption_rate`
- Events: `is_extreme_event` for blizzard and whiteout periods
- Compatibility fields: `timestamp`, `aggregate`, `label`, `is_anomaly`

The canonical file is `backend/dataset/polar_station.csv`. The generator also
writes `backend/dataset/uk_dale.csv` as a temporary compatibility copy for the
unchanged training scripts.

## Simulation Controls

The global navigation exposes two shared judge/demo controls:

- **Blizzard**: increases heating and communications demand, raises wind speed,
       reduces solar availability, marks an extreme event, and forces emergency-aware
       dispatch decisions.
- **Polar night**: sets daylight and solar irradiance to zero so the forecasters
       and optimizer demonstrate renewable scarcity.

The selected mode is persisted in browser storage and synchronized through
`GET/POST /simulation-mode`. The live playground also passes the mode into
`/infer/stream`, which returns weather, forecasts, battery state, and the
optimized dispatch decision on every SSE tick.

## Planned Route Renaming

The following is a documentation-only plan. Existing code routes have not been
renamed yet:

| Current | Planned | Persona or purpose |
|---|---|---|
| `/user` | `/operations` | Station Ops |
| `/industrial` | `/microgrid` | Renewable & Microgrid Manager |
| `/grid` | `/logistics` | Fuel & Logistics Officer |
| `/professor` | `/research` | Research/Admin |
| `/infer` | `/forecast` | Shared forecasting and inference |
| `/devices` | `/assets` | Station asset control |
| `/meter` | `/telemetry` | Station telemetry |

The corresponding future API names are `/station-dashboard`,
`/microgrid-dashboard`, `/fuel-dashboard`, `/research-dashboard`, `/forecast`,
`/assets/*`, and `/telemetry/*`.

## Quick Start

### Backend

```bash
cd backend
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
python -m pip install fastapi uvicorn torch scikit-learn xgboost hmmlearn pandas numpy joblib scipy python-multipart
python training/generate_dataset.py
python training/train_rf.py
python training/train_gb.py
python training/train_logreg.py
python training/train_hmm.py
python training/train_lstm.py
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. The API is available at `http://localhost:8000`.
Use the global navigation controls to activate or clear the simulation modes.

## Three-Minute Demo Script

**0:00–0:30 — Normal operation**

Open Station Ops and point out the live load breakdown, life-support/heating
priority, current weather, and green operating status. Move to Renewable &
Microgrid and show the current solar/wind contribution, battery SOC, and diesel
share.

**0:30–1:00 — Forecast**

Open the Live Playground and start the SSE stream. Explain that the five models
classify the operating regime, forecast load and renewable output, detect faults,
identify weather/operational regime, and forecast fuel/renewable sequences.

**1:00–1:30 — Diesel-sparing dispatch**

Show the dispatch plan returned with each stream tick or open Fuel & Logistics.
Point out renewable-first supply, battery discharge within SOC limits, zero or
reduced genset output, fuel used per interval, and the protected fuel reserve.

**1:30–2:15 — Simulated blizzard**

Click **BLIZZARD** in the global navigation. Heating and communications demand
rises, weather becomes extreme, the operating regime changes to emergency, and
the optimizer preserves the safety fuel reserve while committing diesel when
renewables and battery cannot cover the forecast.

**2:15–2:40 — Polar night**

Click **POLAR NIGHT**. Solar output and daylight go to zero; the renewable
forecast contracts and dispatch shifts toward wind, battery, and diesel. Use
Research/Admin to show the regime confusion matrix and fault-detection ROC.

**2:40–3:00 — Fuel savings summary**

Return to Fuel & Logistics and summarize the projected fuel used, burn rate,
remaining reserve, resupply countdown, and diesel avoided during renewable-first
operation. Finish by noting that the same SSE and batch CSV paths support live
operations and historical station-log replay.

## Future Roadmap

- Satellite and low-bandwidth communications integration for delayed telemetry,
       compressed forecasts, store-and-forward alerts, and remote dispatch approvals.
- Real IEC 61850 microgrid protocol support for interoperable station protection,
       intelligent electronic devices, measurement points, and authenticated
       supervisory control.
- Multi-station fleet views, real telemetry adapters, authenticated operator
       roles, and durable time-series storage.
- Calibrated uncertainty intervals and online model monitoring for deployment
       in changing polar seasons.

## Technology

- Backend: FastAPI, Uvicorn, Pydantic
- ML: scikit-learn, XGBoost, hmmlearn, PyTorch, pandas, NumPy
- Frontend: Next.js 16, React 19, TypeScript
- Visualization: Recharts, Nivo, React Three Fiber, Three.js
- Streaming: Server-Sent Events

## Current Scope

The documentation and generator now use the polar research-station domain. The
existing application code, API paths, model trainers, and frontend folders are
intentionally left in place until the planned route and folder migration is
approved and implemented as a separate step.
