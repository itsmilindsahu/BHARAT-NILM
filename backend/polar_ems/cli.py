"""Command-line interface.

    python -m polar_ems.cli serve                 # API + dashboard on http://localhost:8000
    python -m polar_ems.cli run winter --days 7    # headless scenario run, prints KPIs
    python -m polar_ems.cli train                  # (re)train the forecast models
    python -m polar_ems.cli list-scenarios
"""
from __future__ import annotations

import argparse
import json
import sys
import time

from .config import load_config
from .ems import make_detector
from .forecasting import load_or_train, train_bundle
from .runner import SCENARIOS, Simulation


def cmd_serve(args: argparse.Namespace) -> None:
    import uvicorn

    uvicorn.run("polar_ems.server:app", host=args.host, port=args.port, reload=False)


def cmd_run(args: argparse.Namespace) -> None:
    cfg = load_config(args.config)
    bundle = load_or_train(cfg, force=args.retrain)
    detector = make_detector(cfg, bundle)
    sim = Simulation(cfg, bundle, detector, scenario=args.scenario, days=args.days, seed=args.seed)

    t0 = time.time()
    total = sim.end - sim.i

    def progress(done: int, n: int) -> None:
        if done % 24 == 0 or done == n:
            print(f"  {done:4d}/{n} h  ({time.time() - t0:5.1f}s)", file=sys.stderr)

    sim.run(progress=progress)
    kpis = sim.kpis()

    print(f"\nScenario: {args.scenario}  ({SCENARIOS[args.scenario]['desc']})")
    print(f"Simulated {total} hours in {time.time() - t0:.1f}s\n")
    print(f"{'controller':20s} {'fuel (L)':>10s} {'starts':>7s} {'shed (kWh)':>11s} {'unserved (kWh)':>15s} {'renew %':>8s} {'vs EMS':>8s}")
    for name, v in kpis.items():
        save = f"{v['ems_fuel_saving_pct']:+.1f}%" if "ems_fuel_saving_pct" in v else "—"
        print(f"{name:20s} {v['fuel_l']:10.1f} {v['starts']:7d} {v['shed_kwh']:11.1f} {v['unserved_kwh']:15.1f} {100 * v['renewable_fraction']:8.1f} {save:>8s}")

    if args.json:
        with open(args.json, "w") as fh:
            json.dump(kpis, fh, indent=2)
        print(f"\nWrote KPIs to {args.json}")


def cmd_train(args: argparse.Namespace) -> None:
    cfg = load_config(args.config)
    bundle = train_bundle(cfg, seed=args.seed, verbose=True)
    bundle.save(f"{cfg.forecast.model_dir}/forecast_bundle_seed{args.seed}.joblib")
    print("\nHeld-out skill:")
    for variant, m in bundle.metrics.items():
        print(f"\n[{variant}]")
        print(m.round(2).to_string(index=False))


def cmd_list_scenarios(_args: argparse.Namespace) -> None:
    for key, sc in SCENARIOS.items():
        print(f"{key:12s} {sc['days']:2d}d  {sc['desc']}")


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="polar-ems")
    sub = p.add_subparsers(dest="cmd", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--config", default=None, help="path to a station.yaml override")

    s = sub.add_parser("serve", help="run the API + dashboard", parents=[common])
    s.add_argument("--host", default="0.0.0.0")
    s.add_argument("--port", type=int, default=8000)
    s.set_defaults(func=cmd_serve)

    r = sub.add_parser("run", help="headless scenario run", parents=[common])
    r.add_argument("scenario", choices=sorted(SCENARIOS))
    r.add_argument("--days", type=int, default=None)
    r.add_argument("--seed", type=int, default=1)
    r.add_argument("--retrain", action="store_true", help="ignore any cached forecast models")
    r.add_argument("--json", default=None, help="write KPIs to this path")
    r.set_defaults(func=cmd_run)

    t = sub.add_parser("train", help="(re)train the forecast models", parents=[common])
    t.add_argument("--seed", type=int, default=42)
    t.set_defaults(func=cmd_train)

    sub.add_parser("list-scenarios", help="show available scenarios").set_defaults(func=cmd_list_scenarios)

    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
