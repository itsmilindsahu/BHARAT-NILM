# Bharat Energy AI Architecture

## Mission

Bharat Energy AI is an AI-driven smart energy management system for polar
research stations, aligned with SIH problem statement PS 26061 from MoES and
NCPOR. It helps a station maintain life-support reliability, coordinate diesel
and renewable generation, conserve fuel, and explain energy decisions during
normal operations and blizzards or whiteouts.

The current implementation remains a FastAPI backend, a Next.js frontend, and
five simultaneously available ML models. The present code still contains
legacy NILM names and routes; the rename below is the planned target structure,
not an implementation task.

## System Shape

```text
polar-energy-ai/
├── backend/                         # FastAPI API and model services
│   ├── app.py                       # station APIs and orchestration
│   ├── inference_engine.py          # shared five-model inference wrapper
│   ├── devices.py                   # planned asset/control router
│   ├── replay.py                    # dataset replay and audit tool
│   ├── dataset/polar_station.csv    # synthetic station telemetry
│   ├── models/                      # serialized model artifacts
│   └── training/                    # generation and model training scripts
└── frontend/                        # Next.js station operations console
    └── app/
        ├── page.tsx                 # station overview
        ├── operations/              # Station Ops workspace
        ├── microgrid/               # Renewable & Microgrid Manager
        ├── logistics/               # Fuel & Logistics Officer
        ├── research/                # Research/Admin analytics
        ├── forecast/                # inference and forecast workspace
        ├── assets/                  # generators, battery, and load assets
        └── components/               # shared navigation and visualizations
```

## Five-Model Layer

| Model | Station responsibility |
|---|---|
| Random Forest | Classify the dominant station load regime from aggregate telemetry |
| XGBoost | Forecast the next interval of station demand |
| Logistic Regression | Detect abrupt anomalies and event-related operating changes |
| Gaussian HMM | Identify standby, normal, and peak station regimes |
| LSTM | Forecast a sequence of upcoming load intervals |

The model layer consumes aggregate station demand while the new generator also
retains environmental, renewable, storage, fuel, and named load-channel data for
future feature expansion.

## Personas

### Station Ops

Monitors life-support, heating, communications, alarms, and extreme-event
status. Primary needs are a fast station health view, load prioritization, and
incident-ready explanations.

### Renewable & Microgrid Manager

Balances wind, solar, battery state of charge, and diesel dispatch. Primary
needs are renewable availability, forecast demand, curtailment, and generator
planning.

### Fuel & Logistics Officer

Tracks fuel level, consumption rate, delivery runway, and weather-related
access risk. Primary needs are projected depletion dates and auditable fuel
scenarios.

### Research/Admin

Reviews model quality, historical station behavior, experiments, exports, and
cross-station comparisons. Primary needs are reproducible datasets, metrics,
and research visualizations.

## Planned Folder and Route Renaming

This is the target naming plan for a later frontend/backend migration. It does
not change routes in the current codebase.

| Current route/folder | Planned route/folder | Persona |
|---|---|---|
| `/user` | `/operations` | Station Ops |
| `/industrial` | `/microgrid` | Renewable & Microgrid Manager |
| `/grid` | `/logistics` | Fuel & Logistics Officer |
| `/professor` | `/research` | Research/Admin |
| `/infer` | `/forecast` | Shared model workspace |
| `/devices` | `/assets` | Shared station asset control |
| `/meter` | `/telemetry` | Shared telemetry intake |

Planned API naming follows the same vocabulary: `/station-dashboard`,
`/microgrid-dashboard`, `/fuel-dashboard`, `/research-dashboard`,
`/forecast`, `/telemetry/*`, and `/assets/*`. Existing endpoints remain the
compatibility surface until the route migration is implemented.

## Data Contract

`backend/training/generate_dataset.py` produces one year of 30-minute synthetic
telemetry with 17,520 rows. It includes ambient temperature, wind speed,
irradiance, full polar-day/polar-night daylight cycles, heating, life support,
labs, communications, lighting, kitchen, diesel, wind and solar generation,
battery state, fuel state, fuel consumption, and blizzard/whiteout flags.

The canonical output is `backend/dataset/polar_station.csv`. A compatibility
copy is also written to `backend/dataset/uk_dale.csv` so the unchanged training
scripts continue to run until their paths and feature contracts are renamed.
