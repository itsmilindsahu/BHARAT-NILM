"""FastAPI backend for the live dashboard.

One ``Simulation`` runs in a background thread, stepping once a second (configurable) so the
dashboard can watch a multi-day scenario unfold in real time. All mutation happens through the
REST endpoints below; the dashboard itself only ever reads ``/api/snapshot`` (polled) or
``/api/stream`` (server-sent events) and never touches the simulation object directly.
"""
import asyncio
import json
import threading
import time
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import StationConfig, load_config
from .ems import make_detector
from .forecasting import load_or_train
from .runner import SCENARIOS, Simulation
from .simulator import FAULT_KINDS
from .store import Store

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR.parent / "data"


class World:
    """Owns the one live Simulation and the background clock that advances it."""

    def __init__(self, cfg: StationConfig):
        self.cfg = cfg
        print("Loading forecast models (training on first run; ~30-60s) ...", flush=True)
        self.bundle = load_or_train(cfg, verbose=True)
        self.detector = make_detector(cfg, self.bundle)
        self.lock = threading.RLock()
        self.sim: Simulation | None = None
        self.speed_hz = 1.0  # simulated hours advanced per wall-clock second
        self.playing = True
        self._stop = False
        self._thread = threading.Thread(target=self._clock, daemon=True)
        self.store_path = DATA_DIR / "polar_ems.sqlite"
        self.new_scenario("summer", days=7, seed=1)
        self._thread.start()

    def new_scenario(self, scenario: str, days: int | None = None, seed: int = 1) -> None:
        with self.lock:
            store = Store(str(self.store_path))
            self.sim = Simulation(self.cfg, self.bundle, self.detector, scenario=scenario, days=days, seed=seed, store=store)
            self.playing = True

    def _clock(self) -> None:
        acc = 0.0
        last = time.time()
        while not self._stop:
            time.sleep(0.05)
            now = time.time()
            dt = now - last
            last = now
            if not self.playing:
                continue
            with self.lock:
                if self.sim is None or self.sim.done:
                    continue
                acc += dt * self.speed_hz
                steps = int(acc)
                acc -= steps
                for _ in range(min(steps, 6)):  # cap the catch-up burst so a slow solve can't spiral
                    if self.sim.done:
                        break
                    self.sim.step()


def build_app(cfg: StationConfig | None = None) -> FastAPI:
    cfg = cfg or load_config()
    world = World(cfg)
    app = FastAPI(title="Polar Microgrid EMS")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    class ScenarioReq(BaseModel):
        scenario: str
        days: Optional[int] = None
        seed: int = 1

    class SpeedReq(BaseModel):
        hz: float

    class FaultReq(BaseModel):
        kind: str
        hours: int = 12
        magnitude: float = 1.0
        target: int = 0

    class ColdSnapReq(BaseModel):
        hours: int = 48
        delta_c: float = -12.0

    class OverrideReq(BaseModel):
        gen: int
        mode: Optional[str] = None  # "on" | "off" | null (clear)

    class LinkReq(BaseModel):
        up: bool

    @app.get("/api/meta")
    def meta():
        return {"scenarios": {k: v["desc"] for k, v in SCENARIOS.items()}, "fault_kinds": list(FAULT_KINDS)}

    @app.get("/api/snapshot")
    def snapshot(hist_hours: int = 48):
        if world.sim is None:
            raise HTTPException(503, "simulation not ready")
        snap = world.sim.snapshot(hist_hours=hist_hours)
        snap["playback"] = {"playing": world.playing, "speed_hz": world.speed_hz}
        return snap

    @app.get("/api/stream")
    async def stream():
        async def gen():
            last_version = -1
            while True:
                with world.lock:
                    v = world.sim.version if world.sim else -1
                if v != last_version:
                    last_version = v
                    with world.lock:
                        snap = world.sim.snapshot(hist_hours=48) if world.sim else {}
                    snap["playback"] = {"playing": world.playing, "speed_hz": world.speed_hz}
                    yield f"data: {json.dumps(snap)}\n\n"
                await asyncio.sleep(0.3)

        return StreamingResponse(gen(), media_type="text/event-stream")

    @app.post("/api/scenario")
    def set_scenario(req: ScenarioReq):
        if req.scenario not in SCENARIOS:
            raise HTTPException(400, f"unknown scenario; choose from {sorted(SCENARIOS)}")
        world.new_scenario(req.scenario, days=req.days, seed=req.seed)
        return {"ok": True}

    @app.post("/api/play")
    def play():
        world.playing = True
        return {"ok": True}

    @app.post("/api/pause")
    def pause():
        world.playing = False
        return {"ok": True}

    @app.post("/api/step")
    def step(n: int = 1):
        with world.lock:
            if world.sim is None:
                raise HTTPException(503, "not ready")
            for _ in range(max(1, min(n, 48))):
                if world.sim.done:
                    break
                world.sim.step()
        return {"ok": True}

    @app.post("/api/speed")
    def speed(req: SpeedReq):
        world.speed_hz = max(0.0, min(req.hz, 48.0))
        return {"ok": True, "speed_hz": world.speed_hz}

    @app.post("/api/fault")
    def fault(req: FaultReq):
        if req.kind not in FAULT_KINDS:
            raise HTTPException(400, f"unknown fault kind; choose from {FAULT_KINDS}")
        with world.lock:
            if world.sim is None:
                raise HTTPException(503, "not ready")
            world.sim.inject_fault(req.kind, req.hours, req.magnitude, req.target)
        return {"ok": True}

    @app.post("/api/cold_snap")
    def cold_snap(req: ColdSnapReq):
        with world.lock:
            if world.sim is None:
                raise HTTPException(503, "not ready")
            world.sim.inject_cold_snap(req.hours, req.delta_c)
        return {"ok": True}

    @app.post("/api/override")
    def override(req: OverrideReq):
        with world.lock:
            if world.sim is None:
                raise HTTPException(503, "not ready")
            n = len(world.cfg.generators)
            if not (0 <= req.gen < n):
                raise HTTPException(400, f"gen index must be 0..{n - 1}")
            world.sim.set_override(req.gen, req.mode)
        return {"ok": True}

    @app.post("/api/link")
    def link(req: LinkReq):
        with world.lock:
            if world.sim is None:
                raise HTTPException(503, "not ready")
            world.sim.set_link(req.up)
        return {"ok": True}

    dash_dir = APP_DIR / "dashboard"
    if dash_dir.exists():
        app.mount("/", StaticFiles(directory=str(dash_dir), html=True), name="dashboard")
    return app


app = build_app()
