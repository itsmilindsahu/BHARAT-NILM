"""Local-first persistence and store-and-forward sync.

Everything the EMS learns or decides is written to a local SQLite file first. Anything that
should eventually reach the mainland (summary logs, alerts) goes into an *outbox*; a sync pass
drains the outbox only while the satellite link is up, so an outage costs nothing but delay.
SQLite needs no server, survives power loss (WAL journal) and runs on a Raspberry Pi.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Callable

_SCHEMA = """
CREATE TABLE IF NOT EXISTS telemetry (ts TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS decisions (ts TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS alerts    (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS outbox    (id INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT NOT NULL,
                                      payload TEXT NOT NULL, created REAL NOT NULL, sent REAL);
CREATE TABLE IF NOT EXISTS kv        (k TEXT PRIMARY KEY, v TEXT NOT NULL);
"""


class Store:
    def __init__(self, path: str | Path = ":memory:"):
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._lock = threading.RLock()
        with self._lock:
            if str(path) != ":memory:":
                self._db.execute("PRAGMA journal_mode=WAL")
            self._db.executescript(_SCHEMA)
            self._db.commit()

    # ---------------------------------------------------------------- logging
    def _put(self, table: str, ts: str, payload: dict) -> None:
        with self._lock:
            self._db.execute(f"INSERT OR REPLACE INTO {table}(ts, payload) VALUES (?, ?)", (ts, json.dumps(payload)))
            self._db.commit()

    def log_telemetry(self, ts: str, payload: dict) -> None:
        self._put("telemetry", ts, payload)

    def log_decision(self, ts: str, payload: dict) -> None:
        self._put("decisions", ts, payload)

    def log_alert(self, ts: str, payload: dict) -> None:
        with self._lock:
            self._db.execute("INSERT INTO alerts(ts, payload) VALUES (?, ?)", (ts, json.dumps(payload)))
            self._db.commit()

    def count(self, table: str) -> int:
        with self._lock:
            return int(self._db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])

    # ----------------------------------------------------------------- outbox
    def outbox_put(self, topic: str, payload: dict) -> None:
        with self._lock:
            self._db.execute(
                "INSERT INTO outbox(topic, payload, created) VALUES (?, ?, ?)", (topic, json.dumps(payload), time.time())
            )
            self._db.commit()

    def outbox_pending(self, limit: int = 500) -> list[tuple[int, str, dict]]:
        with self._lock:
            rows = self._db.execute(
                "SELECT id, topic, payload FROM outbox WHERE sent IS NULL ORDER BY id LIMIT ?", (limit,)
            ).fetchall()
        return [(r[0], r[1], json.loads(r[2])) for r in rows]

    def outbox_size(self) -> int:
        with self._lock:
            return int(self._db.execute("SELECT COUNT(*) FROM outbox WHERE sent IS NULL").fetchone()[0])

    def outbox_mark_sent(self, ids: list[int]) -> None:
        if not ids:
            return
        with self._lock:
            self._db.executemany("UPDATE outbox SET sent=? WHERE id=?", [(time.time(), i) for i in ids])
            self._db.commit()

    def sync(self, link_up: bool, sink: Callable[[str, dict], None]) -> int:
        """Drain the outbox through ``sink`` while the link is up. Returns the number of records sent.

        A failing sink stops the pass without losing anything: unsent rows simply stay queued.
        """
        if not link_up:
            return 0
        sent: list[int] = []
        for row_id, topic, payload in self.outbox_pending():
            try:
                sink(topic, payload)
            except Exception:
                break
            sent.append(row_id)
        self.outbox_mark_sent(sent)
        return len(sent)

    # --------------------------------------------------------------------- kv
    def kv_set(self, key: str, value: object) -> None:
        with self._lock:
            self._db.execute("INSERT OR REPLACE INTO kv(k, v) VALUES (?, ?)", (key, json.dumps(value)))
            self._db.commit()

    def kv_get(self, key: str, default: object = None) -> object:
        with self._lock:
            row = self._db.execute("SELECT v FROM kv WHERE k=?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def close(self) -> None:
        with self._lock:
            self._db.close()


class JsonlSink:
    """Stand-in for the remote server: appends every synced record to a JSON-lines file."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def __call__(self, topic: str, payload: dict) -> None:
        with open(self.path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps({"topic": topic, "payload": payload}) + "\n")
