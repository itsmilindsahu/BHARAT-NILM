"""Edge I/O: the telemetry bus (MQTT) and the adapter that talks to the site controller.

Both are thin, replaceable layers. The default ``InProcessBus`` keeps the demo dependency-free;
``MqttBus`` publishes the same messages to a Mosquitto broker for Grafana/Node-RED/etc.
Publishing never raises into the control loop: telemetry is best-effort, decisions are not.
"""
from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Callable, Protocol

from .optimizer import Dispatch


# ------------------------------------------------------------------------ bus
class TelemetryBus(Protocol):
    def publish(self, topic: str, payload: dict) -> None: ...


class InProcessBus:
    def __init__(self) -> None:
        self.last: dict[str, dict] = {}
        self._subs: dict[str, list[Callable[[str, dict], None]]] = defaultdict(list)

    def subscribe(self, topic: str, cb: Callable[[str, dict], None]) -> None:
        self._subs[topic].append(cb)

    def publish(self, topic: str, payload: dict) -> None:
        self.last[topic] = payload
        for cb in self._subs.get(topic, []):
            cb(topic, payload)


class MqttBus:
    """Publishes to ``<prefix>/<topic>`` on an MQTT broker (e.g. Mosquitto on the edge server).

    Uses paho-mqtt's background network thread and QoS 1, so messages queue in the client
    while the broker is unreachable instead of blocking the EMS.
    """

    def __init__(self, host: str, port: int = 1883, prefix: str = "polar-ems", client_factory=None):
        if client_factory is None:
            import paho.mqtt.client as mqtt

            client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"{prefix}-ems")
        else:
            client = client_factory()
        self.prefix = prefix
        self._client = client
        self._client.connect_async(host, port)
        self._client.loop_start()

    def publish(self, topic: str, payload: dict) -> None:
        try:
            self._client.publish(f"{self.prefix}/{topic}", json.dumps(payload), qos=1)
        except Exception:  # never let telemetry break control
            pass

    def close(self) -> None:
        self._client.loop_stop()
        self._client.disconnect()


# ----------------------------------------------------------------- controller
class ControllerAdapter(Protocol):
    def write_setpoints(self, d: Dispatch) -> bool: ...


class NullController:
    """Simulation: the plant model consumes the dispatch directly, so nothing needs to be written."""

    def write_setpoints(self, d: Dispatch) -> bool:
        return True


@dataclass
class RegisterMap:
    """Modbus holding-register layout of the site controller (fill in from its manual)."""

    gen_on: list[int] = field(default_factory=lambda: [100, 101])
    gen_kw: list[int] = field(default_factory=lambda: [110, 111])
    batt_kw: int = 120
    kw_scale: float = 10.0  # register units per kW (0.1 kW resolution)


class ModbusController:
    """Reference Modbus-TCP adapter (IEC 61850 / OPC UA adapters implement the same two-line protocol).

    ``client`` is any object with ``write_register(address, value, **kw)`` -- e.g. pymodbus'
    ``ModbusTcpClient``. NOTE: register addresses are placeholders and this adapter has been
    exercised against a fake client only; verify it against the real controller (in a bench test,
    with the controller's own safety interlocks enabled) before any site use.
    """

    def __init__(self, client, regmap: RegisterMap | None = None, unit: int = 1):
        self.client, self.map, self.unit = client, regmap or RegisterMap(), unit

    def _write(self, address: int, value: int) -> None:
        v = int(value) & 0xFFFF  # two's complement for signed values
        try:
            self.client.write_register(address, v, slave=self.unit)
        except TypeError:  # newer pymodbus renamed the keyword
            self.client.write_register(address, v, device_id=self.unit)

    def write_setpoints(self, d: Dispatch) -> bool:
        try:
            for i, on in enumerate(d.gen_on):
                self._write(self.map.gen_on[i], 1 if on else 0)
                self._write(self.map.gen_kw[i], round(d.gen_kw[i] * self.map.kw_scale))
            self._write(self.map.batt_kw, round(d.batt_kw * self.map.kw_scale))
            return True
        except Exception:
            return False
