"""
generate_dataset.py
-------------------
Generates a realistic UK-DALE-style synthetic dataset with:
- 5 appliances with realistic power profiles
- Time-of-day and weekday/weekend patterns
- Overlapping appliance usage (real homes don't use one thing at a time)
- Gaussian noise per appliance
- Anomaly spikes (~2% of readings)
- Configurable number of rows (default 8000 ≈ ~5.5 days at 1-min resolution)
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import os


# ------------------------------------------------------------------
# Appliance profiles
# Each entry: (mean_watts, std_dev, active_hours_start, active_hours_end)
# ------------------------------------------------------------------
APPLIANCE_PROFILES = {
    "geyser":          (1500, 120, 5,  9),   # morning shower window
    "ac":              (1200, 150, 12, 22),  # afternoon/evening
    "washing_machine": (700,  100, 8,  12),  # morning chores
    "tv":              (200,  40,  17, 23),  # evening
    "fridge":          (150,  20,  0,  24),  # always on
}

ANOMALY_RATE = 0.02      # 2% rows get a spike
ANOMALY_MULTIPLIER = 3.5


def appliance_power(name, profile, hour, is_weekend):
    mean_w, std_w, start_h, end_h = profile

    # Check if in active window
    if start_h <= end_h:
        active = start_h <= hour < end_h
    else:
        active = hour >= start_h or hour < end_h

    # Weekends: fridge same, others shift slightly later
    if is_weekend and name != "fridge":
        hour = (hour - 1) % 24

    if not active:
        # Standby / off — tiny leakage
        return max(0, np.random.normal(5, 2))

    return max(0, np.random.normal(mean_w, std_w))


def dominant_label(powers: dict) -> str:
    """Return the appliance with the highest draw as the NILM label."""
    return max(powers, key=powers.get)


def main():
    print("Generating improved dataset...")

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dataset_path = os.path.join(base_dir, "dataset", "uk_dale.csv")

    rows = 8000
    start_time = datetime(2023, 1, 1, 0, 0, 0)

    records = []

    for i in range(rows):
        ts = start_time + timedelta(minutes=i)
        hour = ts.hour
        is_weekend = ts.weekday() >= 5  # Sat/Sun

        powers = {
            name: appliance_power(name, profile, hour, is_weekend)
            for name, profile in APPLIANCE_PROFILES.items()
        }

        aggregate = sum(powers.values())

        # Inject anomaly spike
        is_anomaly = np.random.rand() < ANOMALY_RATE
        if is_anomaly:
            spike_appliance = np.random.choice(list(powers.keys()))
            powers[spike_appliance] *= ANOMALY_MULTIPLIER
            aggregate = sum(powers.values())

        label = dominant_label(powers)

        record = {
            "timestamp": ts,
            "aggregate": round(aggregate, 2),
            "label": label,
            "is_anomaly": int(is_anomaly),
        }
        # Individual channel columns (useful for future disaggregation training)
        for name, w in powers.items():
            record[f"ch_{name}"] = round(w, 2)

        records.append(record)

    df = pd.DataFrame(records)

    os.makedirs(os.path.dirname(dataset_path), exist_ok=True)
    df.to_csv(dataset_path, index=False)

    print(f"Dataset saved to: {dataset_path}")
    print(f"Rows: {len(df)}")
    print(f"Label distribution:\n{df['label'].value_counts()}")
    print(f"Anomalies injected: {df['is_anomaly'].sum()}")
    print(f"Aggregate range: {df['aggregate'].min():.1f}W – {df['aggregate'].max():.1f}W")


if __name__ == "__main__":
    main()