"""
devices.py  —  Smart Plug Management API
=========================================
Mount this in app.py:
    from devices import router as devices_router
    app.include_router(devices_router, prefix="/devices")

Endpoints
---------
  GET    /devices                  — list all plugs
  POST   /devices                  — register a new plug
  GET    /devices/{id}             — get single plug
  PATCH  /devices/{id}             — update (rename, toggle, schedule)
  DELETE /devices/{id}             — remove plug
  POST   /devices/{id}/toggle      — flip ON/OFF
  GET    /devices/{id}/energy      — energy history (last 60 readings)
  POST   /devices/{id}/schedule    — set schedule
  DELETE /devices/{id}/schedule    — clear schedule
  POST   /devices/simulate-tick    — advance simulation (call from frontend polling)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, time
import uuid
import random
import math

router = APIRouter()

# ─── In-memory store ──────────────────────────────────────
# In production, swap with PostgreSQL / Redis
PLUGS: dict[str, dict] = {}

# Seed with 5 demo plugs so the page isn't empty on first load
SEED_PLUGS = [
    {"name": "Living Room AC",   "appliance": "ac",              "room": "Living Room", "on": True  },
    {"name": "Kitchen Fridge",   "appliance": "fridge",          "room": "Kitchen",     "on": True  },
    {"name": "Bedroom Fan",      "appliance": "fan",             "room": "Bedroom",     "on": True  },
    {"name": "TV Unit",          "appliance": "tv",              "room": "Living Room", "on": False },
    {"name": "Bathroom Geyser",  "appliance": "geyser",          "room": "Bathroom",    "on": False },
]

APPLIANCE_BASE_WATTS = {
    "ac":              1200,
    "fridge":          150,
    "fan":             75,
    "tv":              180,
    "geyser":          1500,
    "washing_machine": 650,
    "microwave":       1000,
    "light":           20,
    "other":           100,
}

def _make_plug(name: str, appliance: str, room: str, on: bool) -> dict:
    pid = str(uuid.uuid4())[:8]
    base = APPLIANCE_BASE_WATTS.get(appliance, 100)
    return {
        "id":           pid,
        "name":         name,
        "appliance":    appliance,
        "room":         room,
        "on":           on,
        "created_at":   datetime.now().isoformat(),
        # Energy tracking
        "watts_now":    round(base * random.uniform(0.9, 1.1), 1) if on else 0.0,
        "kwh_today":    round(random.uniform(0.2, 3.5), 3),
        "kwh_month":    round(random.uniform(5.0, 60.0), 2),
        "cost_today":   0.0,   # computed on read
        "cost_month":   0.0,
        # Schedule
        "schedule": None,
        # History — list of {t, w} last 60 ticks
        "history":  [],
        # Metadata
        "signal_strength": random.randint(60, 100),   # % wifi
        "firmware": "v2.1.4",
        "mac": ":".join([f"{random.randint(0,255):02x}" for _ in range(6)]),
    }

# Seed on startup
for s in SEED_PLUGS:
    p = _make_plug(s["name"], s["appliance"], s["room"], s["on"])
    PLUGS[p["id"]] = p

TARIFF = 6.5  # ₹/kWh

def _enrich(plug: dict) -> dict:
    """Compute derived fields before returning."""
    p = plug.copy()
    p["cost_today"]  = round(p["kwh_today"]  * TARIFF, 2)
    p["cost_month"]  = round(p["kwh_month"]  * TARIFF, 2)
    return p

def _tick_plug(plug: dict):
    """Simulate one polling tick (~3s of real time)."""
    base = APPLIANCE_BASE_WATTS.get(plug["appliance"], 100)
    if plug["on"]:
        # Slight realistic variance
        t = len(plug["history"])
        noise = math.sin(t * 0.4) * base * 0.04 + random.gauss(0, base * 0.02)
        plug["watts_now"] = round(max(0, base + noise), 1)
        # Accumulate energy: 3s tick → hours = 3/3600
        plug["kwh_today"]  = round(plug["kwh_today"]  + plug["watts_now"] / 1000 * (3/3600), 4)
        plug["kwh_month"]  = round(plug["kwh_month"]  + plug["watts_now"] / 1000 * (3/3600), 4)
    else:
        plug["watts_now"] = 0.0

    plug["history"].append({
        "t": datetime.now().isoformat(),
        "w": plug["watts_now"],
    })
    if len(plug["history"]) > 60:
        plug["history"].pop(0)

    # Auto-schedule check
    sched = plug.get("schedule")
    if sched:
        now = datetime.now()
        now_t = now.hour * 60 + now.minute
        if sched.get("off_at"):
            oh, om = map(int, sched["off_at"].split(":"))
            off_t = oh * 60 + om
            if abs(now_t - off_t) <= 1:
                plug["on"] = False
                plug["watts_now"] = 0.0
        if sched.get("on_at"):
            oh, om = map(int, sched["on_at"].split(":"))
            on_t = oh * 60 + om
            if abs(now_t - on_t) <= 1:
                plug["on"] = True


# ─── Request models ────────────────────────────────────────
class CreatePlug(BaseModel):
    name:      str
    appliance: str = "other"
    room:      str = "Home"

class UpdatePlug(BaseModel):
    name:      Optional[str] = None
    appliance: Optional[str] = None
    room:      Optional[str] = None
    on:        Optional[bool] = None

class SetSchedule(BaseModel):
    on_at:    Optional[str] = None   # "HH:MM"
    off_at:   Optional[str] = None   # "HH:MM"
    repeat:   bool = True
    label:    Optional[str] = None


# ─── Routes ───────────────────────────────────────────────
@router.get("")
def list_plugs():
    # Tick all plugs on each poll
    for p in PLUGS.values():
        _tick_plug(p)
    return [_enrich(p) for p in PLUGS.values()]


@router.post("")
def create_plug(body: CreatePlug):
    p = _make_plug(body.name, body.appliance, body.room, on=False)
    PLUGS[p["id"]] = p
    return _enrich(p)


@router.get("/{pid}")
def get_plug(pid: str):
    if pid not in PLUGS:
        raise HTTPException(404, "Plug not found")
    _tick_plug(PLUGS[pid])
    return _enrich(PLUGS[pid])


@router.patch("/{pid}")
def update_plug(pid: str, body: UpdatePlug):
    if pid not in PLUGS:
        raise HTTPException(404, "Plug not found")
    p = PLUGS[pid]
    if body.name      is not None: p["name"]      = body.name
    if body.appliance is not None: p["appliance"]  = body.appliance
    if body.room      is not None: p["room"]       = body.room
    if body.on        is not None:
        p["on"] = body.on
        if not body.on:
            p["watts_now"] = 0.0
    return _enrich(p)


@router.delete("/{pid}")
def delete_plug(pid: str):
    if pid not in PLUGS:
        raise HTTPException(404, "Plug not found")
    del PLUGS[pid]
    return {"deleted": pid}


@router.post("/{pid}/toggle")
def toggle_plug(pid: str):
    if pid not in PLUGS:
        raise HTTPException(404, "Plug not found")
    p = PLUGS[pid]
    p["on"] = not p["on"]
    if not p["on"]:
        p["watts_now"] = 0.0
    _tick_plug(p)
    return _enrich(p)


@router.get("/{pid}/energy")
def get_energy(pid: str):
    if pid not in PLUGS:
        raise HTTPException(404, "Plug not found")
    p = PLUGS[pid]
    return {
        "id":         pid,
        "name":       p["name"],
        "watts_now":  p["watts_now"],
        "kwh_today":  p["kwh_today"],
        "kwh_month":  p["kwh_month"],
        "cost_today": round(p["kwh_today"] * TARIFF, 2),
        "cost_month": round(p["kwh_month"] * TARIFF, 2),
        "history":    p["history"],
    }


@router.post("/{pid}/schedule")
def set_schedule(pid: str, body: SetSchedule):
    if pid not in PLUGS:
        raise HTTPException(404, "Plug not found")
    PLUGS[pid]["schedule"] = body.dict()
    return _enrich(PLUGS[pid])


@router.delete("/{pid}/schedule")
def clear_schedule(pid: str):
    if pid not in PLUGS:
        raise HTTPException(404, "Plug not found")
    PLUGS[pid]["schedule"] = None
    return _enrich(PLUGS[pid])