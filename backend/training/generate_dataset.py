import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import os

def main():
    print("Generating dataset...")

    base_dir = os.path.dirname(os.path.dirname(__file__))
    dataset_path = os.path.join(base_dir, "dataset", "uk_dale.csv")

    rows = 2000
    start_time = datetime(2023, 1, 1)

    timestamps = []
    aggregate = []
    labels = []

    for i in range(rows):
        time = start_time + timedelta(minutes=i)
        hour = time.hour

        if 6 <= hour <= 8:
            power = np.random.normal(1200, 100)
            label = "geyser"
        elif 18 <= hour <= 23:
            power = np.random.normal(300, 50)
            label = "tv"
        elif 0 <= hour <= 5:
            power = np.random.normal(150, 20)
            label = "fridge"
        else:
            power = np.random.normal(200, 30)
            label = "fan"

        timestamps.append(time)
        aggregate.append(abs(power))
        labels.append(label)

    df = pd.DataFrame({
        "timestamp": timestamps,
        "aggregate": aggregate,
        "label": labels
    })

    os.makedirs(os.path.dirname(dataset_path), exist_ok=True)
    df.to_csv(dataset_path, index=False)

    print("Dataset saved to:", dataset_path)
    print("Rows created:", len(df))

if __name__ == "__main__":
    main()
