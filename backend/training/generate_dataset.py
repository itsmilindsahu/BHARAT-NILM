"""Generate a synthetic polar research station energy dataset.

The default simulation covers one year at 30-minute resolution. It models
seasonal polar daylight, weather, station loads, renewable generation,
battery state, fuel use, and blizzard/whiteout events.
"""

import os
from datetime import datetime, timedelta

import numpy as np
import pandas as pd


ROWS = 17_520
INTERVAL_MINUTES = 30
STATION_LATITUDE = -75.0
GENSET_CAPACITY_KW = 240.0
BATTERY_CAPACITY_KWH = 720.0

LOAD_CHANNELS = ["heating", "life_support", "labs", "comms", "lighting", "kitchen"]


def daylight_hours(day_of_year: int, latitude: float = STATION_LATITUDE) -> float:
    """Return astronomical daylight duration, including polar day/night."""
    declination = np.deg2rad(23.44) * np.sin(
        2 * np.pi * (day_of_year - 81) / 365.25
    )
    latitude_rad = np.deg2rad(latitude)
    hour_angle_cos = -np.tan(latitude_rad) * np.tan(declination)

    if hour_angle_cos <= -1:
        return 24.0
    if hour_angle_cos >= 1:
        return 0.0
    return float(24 * np.arccos(hour_angle_cos) / np.pi)


def solar_irradiance(day_of_year: int, hour: float, daylight: float) -> float:
    """Approximate surface irradiance with a polar seasonal envelope."""
    if daylight == 0:
        return 0.0

    seasonal_peak = max(0.0, np.sin(2 * np.pi * (day_of_year - 80) / 365.25))
    sunrise = 12 - daylight / 2
    solar_angle = np.pi * (hour - sunrise) / max(daylight, 0.1)
    daily_shape = max(0.0, np.sin(solar_angle))
    return max(0.0, 520 * seasonal_peak * daily_shape)


def gaussian_noise(mean: float, standard_deviation: float) -> float:
    return max(0.0, float(np.random.normal(mean, standard_deviation)))


def dominant_load(loads: dict[str, float]) -> str:
    return max(loads, key=loads.get)


def main() -> None:
    np.random.seed(42)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dataset_dir = os.path.join(base_dir, "dataset")
    dataset_path = os.path.join(dataset_dir, "polar_station.csv")
    compatibility_path = os.path.join(dataset_dir, "uk_dale.csv")

    start_time = datetime(2024, 1, 1)
    battery_soc = 0.72
    fuel_level = 18_000.0
    extreme_event_remaining = 0
    records = []

    for index in range(ROWS):
        timestamp = start_time + timedelta(minutes=INTERVAL_MINUTES * index)
        day_of_year = timestamp.timetuple().tm_yday
        hour = timestamp.hour + timestamp.minute / 60
        daylight = daylight_hours(day_of_year)

        seasonal_temperature = 8.0 * np.sin(2 * np.pi * (day_of_year - 105) / 365.25)
        ambient_temp = seasonal_temperature - 17.0 + gaussian_noise(0, 2.5)
        wind_speed = max(0.0, np.random.weibull(2.0) * 8.0 + gaussian_noise(0, 1.5))

        if extreme_event_remaining == 0 and np.random.random() < 0.0015:
            extreme_event_remaining = int(np.random.randint(4, 25))
        is_extreme_event = int(extreme_event_remaining > 0)
        if is_extreme_event:
            extreme_event_remaining -= 1
            wind_speed += np.random.uniform(8, 20)
            ambient_temp -= np.random.uniform(2, 8)

        irradiance = solar_irradiance(day_of_year, hour, daylight)
        if is_extreme_event:
            irradiance *= np.random.uniform(0.03, 0.25)
        solar_irradiance_value = max(0.0, irradiance + gaussian_noise(0, 8))

        daylight_factor = 1.0 if daylight == 24 else daylight / 24
        active_research_window = 1.0 if 8 <= hour < 20 and daylight > 0 else 0.45
        meal_window = 1.0 if hour in range(7, 10) or hour in range(12, 14) or hour in range(18, 21) else 0.25

        loads = {
            "heating": 42 + max(0, -ambient_temp - 8) * 3.2 + gaussian_noise(0, 4),
            "life_support": 34 + gaussian_noise(0, 2.5),
            "labs": 12 + 55 * active_research_window + gaussian_noise(0, 6),
            "comms": 10 + 18 * (0.7 + active_research_window / 2) + gaussian_noise(0, 2),
            "lighting": 8 + 30 * (1 - daylight_factor) + gaussian_noise(0, 3),
            "kitchen": 5 + 32 * meal_window + gaussian_noise(0, 4),
        }
        if is_extreme_event:
            loads["heating"] *= 1.18
            loads["comms"] *= 1.25
            loads["life_support"] *= 1.08

        total_load_kw = sum(loads.values())
        wind_gen_kw = min(125.0, max(0.0, 2.2 * wind_speed**2) * np.random.uniform(0.75, 1.05))
        solar_gen_kw = min(105.0, solar_irradiance_value / 1000 * 110)
        renewable_kw = wind_gen_kw + solar_gen_kw
        net_load_kw = total_load_kw - renewable_kw

        battery_power_kw = 0.0
        if net_load_kw < 0:
            battery_power_kw = max(net_load_kw, -BATTERY_CAPACITY_KWH * 0.8)
        elif battery_soc > 0.18:
            battery_power_kw = -min(net_load_kw, battery_soc * BATTERY_CAPACITY_KWH * 0.8)

        battery_delta = -battery_power_kw * (INTERVAL_MINUTES / 60) / BATTERY_CAPACITY_KWH
        battery_soc = float(np.clip(battery_soc + battery_delta, 0.08, 0.98))
        diesel_genset_output_kw = max(0.0, min(GENSET_CAPACITY_KW, net_load_kw + battery_power_kw))
        fuel_consumption_rate = 0.22 * diesel_genset_output_kw + (1.5 if diesel_genset_output_kw > 0 else 0)
        fuel_level = max(0.0, fuel_level - fuel_consumption_rate * INTERVAL_MINUTES / 60)

        records.append({
            "timestamp": timestamp,
            "ambient_temp": round(ambient_temp, 2),
            "wind_speed": round(wind_speed, 2),
            "solar_irradiance": round(solar_irradiance_value, 2),
            "daylight_hours": round(daylight, 2),
            **{channel: round(value, 2) for channel, value in loads.items()},
            "diesel_genset_output": round(diesel_genset_output_kw, 2),
            "wind_gen_output": round(wind_gen_kw, 2),
            "solar_gen_output": round(solar_gen_kw, 2),
            "battery_soc": round(battery_soc, 4),
            "fuel_level": round(fuel_level, 2),
            "fuel_consumption_rate": round(fuel_consumption_rate, 2),
            "is_extreme_event": is_extreme_event,
            "aggregate": round(total_load_kw, 2),
            "label": dominant_load(loads),
            "is_anomaly": is_extreme_event,
        })

    dataframe = pd.DataFrame(records)
    os.makedirs(dataset_dir, exist_ok=True)
    dataframe.to_csv(dataset_path, index=False)
    dataframe.to_csv(compatibility_path, index=False)

    print(f"Dataset saved to: {dataset_path}")
    print(f"Compatibility copy saved to: {compatibility_path}")
    print(f"Rows: {len(dataframe)} ({INTERVAL_MINUTES}-minute resolution)")
    print(f"Extreme-event rows: {dataframe['is_extreme_event'].sum()}")
    print(f"Polar daylight range: {dataframe['daylight_hours'].min():.1f}-{dataframe['daylight_hours'].max():.1f} hours")


if __name__ == "__main__":
    main()
