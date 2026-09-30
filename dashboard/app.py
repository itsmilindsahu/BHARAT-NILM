"""
Bharat-NILM Live Server
----------------------
- Serves frontend (HTML/CSS/JS)
- Runs WebSocket endpoint
- Simulates ESP32 smart plug streaming
- Suitable for Fly.io / Railway deployment
"""

import asyncio
import json
import random
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

# =========================
# APP SETUP
# =========================

app = FastAPI()

# Serve frontend static files
app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")

# Root route → index.html
@app.get("/")
async def serve_index():
    return FileResponse("frontend/index.html")

# =========================
# ESP32 SMART PLUG SIMULATION
# =========================

LOAD_CHANNELS = {
    "Heating": (900, 1800),
    "Life Support": (180, 300),
    "Comms": (60, 140),
    "Labs": (300, 800),
    "Kitchen-Mess": (250, 600)
}

async def esp32_simulator(websocket: WebSocket):
    """
    Simulates an ESP32 smart plug streaming
    power change events continuously.
    """
    event_id = 0

    while True:
        load_channel = random.choice(list(LOAD_CHANNELS.keys()))
        delta_power = random.randint(
            LOAD_CHANNELS[load_channel][0],
            LOAD_CHANNELS[load_channel][1]
        )
        hour = random.randint(0, 23)

        event = {
            "event_id": event_id,
            "load_channel": load_channel,
            "delta_power": delta_power,
            "hour": hour,
            "confidence": round(random.uniform(0.85, 0.98), 2)
        }

        await websocket.send_text(json.dumps(event))
        event_id += 1

        # Realistic smart-meter interval
        await asyncio.sleep(2)

# =========================
# WEBSOCKET ENDPOINT
# =========================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket client connected")

    try:
        await esp32_simulator(websocket)
    except WebSocketDisconnect:
        print("WebSocket client disconnected")

# =========================
# ENTRY POINT
# =========================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))

    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=port,
        reload=False
    )
