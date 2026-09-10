"""
replay.py  —  Dataset Replay Tool
===================================
Replays the generated dataset through the full ML inference engine,
recording predictions for every row and saving a replay log as JSON.

Usage
-----
    python replay.py                          # replay full dataset
    python replay.py --limit 500             # first 500 rows only
    python replay.py --output replay_log.json
    python replay.py --summary               # print stats only, no file

Output JSON structure
---------------------
{
  "meta": { "rows": 500, "dataset": "...", "generated_at": "..." },
  "rows": [
    {
      "i": 0,
      "timestamp": "...",
      "aggregate": 1234.5,
      "true_label": "ac",
      "rf_label": "ac",
      "rf_correct": true,
      "rf_confidence": 0.91,
      "anomaly_score": 0.12,
      "is_anomaly": false,
      "hmm_regime": "normal",
      "gb_next_watt": 1210.0,
      "lstm_forecast": 1190.0,
      "lstm_ready": true
    },
    ...
  ],
  "summary": {
    "rf_accuracy": 0.94,
    "anomaly_rate": 0.02,
    "avg_rf_confidence": 0.88,
    "lstm_ready_pct": 0.96,
    "regime_distribution": { "standby": 120, "normal": 280, "peak": 100 }
  }
}
"""

import os
import sys
import json
import argparse
import time
from datetime import datetime

import pandas as pd

# ── Resolve paths ─────────────────────────────────────────
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(SCRIPT_DIR, "dataset", "uk_dale.csv")
DEFAULT_OUT  = os.path.join(SCRIPT_DIR, "replay_log.json")


def hmm_regime_name(state_id: int) -> str:
    return {0: "standby", 1: "normal", 2: "peak"}.get(state_id, "normal")


def run_replay(limit: int = None, output: str = DEFAULT_OUT, summary_only: bool = False) -> dict:
    # ── Load dataset ──────────────────────────────────────
    if not os.path.exists(DATASET_PATH):
        print(f"[ERROR] Dataset not found at {DATASET_PATH}")
        print("        Run: python training/generate_dataset.py")
        sys.exit(1)

    print(f"[replay] Loading dataset: {DATASET_PATH}")
    df = pd.read_csv(DATASET_PATH)

    if limit:
        df = df.head(limit)
        print(f"[replay] Limited to first {limit} rows")

    total = len(df)
    print(f"[replay] Replaying {total} rows through InferenceEngine…")

    # ── Import engine (after path resolution) ─────────────
    sys.path.insert(0, SCRIPT_DIR)
    from inference_engine import InferenceEngine
    engine = InferenceEngine()

    # ── Replay loop ───────────────────────────────────────
    rows        = []
    correct     = 0
    anomalies   = 0
    lstm_ready  = 0
    conf_total  = 0.0
    regime_dist: dict = {}

    start = time.time()

    for i, row in df.iterrows():
        idx        = len(rows)
        aggregate  = float(row["aggregate"])
        timestamp  = str(row.get("timestamp", datetime.now().isoformat()))
        true_label = str(row.get("label", ""))

        ml = engine.predict(aggregate, timestamp)

        rf_label    = ml["rf_label"]
        rf_conf     = ml["rf_confidence"]
        rf_correct  = rf_label == true_label
        anom        = ml["anomaly_score"]
        lstm_val    = ml["lstm_forecast"]
        lstm_ok     = lstm_val > 0
        hmm_regime  = hmm_regime_name(ml["hmm_state"])
        gb_next     = ml.get("gb_usage_next", 0)

        if rf_correct:
            correct += 1
        if anom > 0.5:
            anomalies += 1
        if lstm_ok:
            lstm_ready += 1
        conf_total += rf_conf
        regime_dist[hmm_regime] = regime_dist.get(hmm_regime, 0) + 1

        rows.append({
            "i":             idx,
            "timestamp":     timestamp,
            "aggregate":     aggregate,
            "true_label":    true_label,
            "rf_label":      rf_label,
            "rf_correct":    rf_correct,
            "rf_confidence": round(rf_conf, 4),
            "anomaly_score": round(anom, 4),
            "is_anomaly":    anom > 0.5,
            "hmm_regime":    hmm_regime,
            "gb_next_watt":  round(gb_next, 2),
            "lstm_forecast": round(lstm_val, 2),
            "lstm_ready":    lstm_ok,
        })

        if (idx + 1) % 500 == 0:
            elapsed = time.time() - start
            rate    = (idx + 1) / elapsed
            print(f"  {idx + 1}/{total}  ({rate:.0f} rows/s)  RF acc so far: {correct / (idx + 1):.3f}")

    elapsed = time.time() - start

    # ── Summary ───────────────────────────────────────────
    summary = {
        "rf_accuracy":         round(correct / total, 4),
        "anomaly_rate":        round(anomalies / total, 4),
        "avg_rf_confidence":   round(conf_total / total, 4),
        "lstm_ready_pct":      round(lstm_ready / total, 4),
        "regime_distribution": regime_dist,
        "total_rows":          total,
        "elapsed_seconds":     round(elapsed, 2),
    }

    print("\n── Replay Summary ─────────────────────────────────")
    print(f"  RF Accuracy:         {summary['rf_accuracy']:.4f}  ({correct}/{total})")
    print(f"  Anomaly Rate:        {summary['anomaly_rate']:.4f}  ({anomalies} flagged)")
    print(f"  Avg RF Confidence:   {summary['avg_rf_confidence']:.4f}")
    print(f"  LSTM Ready %:        {summary['lstm_ready_pct']:.4f}")
    print(f"  Regime Distribution: {regime_dist}")
    print(f"  Time:                {elapsed:.2f}s  ({total/elapsed:.0f} rows/s)")

    if summary_only:
        print("\n[replay] --summary mode: no file written.")
        return summary

    # ── Write output ──────────────────────────────────────
    result = {
        "meta": {
            "rows":         total,
            "dataset":      DATASET_PATH,
            "generated_at": datetime.now().isoformat(),
            "limit":        limit,
        },
        "summary": summary,
        "rows":    rows,
    }

    with open(output, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\n[replay] Log saved → {output}  ({os.path.getsize(output) // 1024} KB)")
    return summary


# ── CLI ───────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Replay dataset through NILM inference engine")
    parser.add_argument("--limit",   type=int, default=None,        help="Max rows to replay (default: all)")
    parser.add_argument("--output",  type=str, default=DEFAULT_OUT, help="Output JSON path")
    parser.add_argument("--summary", action="store_true",           help="Print summary only, skip writing file")
    args = parser.parse_args()

    run_replay(limit=args.limit, output=args.output, summary_only=args.summary)