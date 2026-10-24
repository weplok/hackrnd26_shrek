from __future__ import annotations

import hashlib
import json
import sqlite3
from contextlib import closing
from datetime import UTC, datetime, timedelta
from pathlib import Path

from .schemas import TelemetryEvent


class TelemetryStore:
    def __init__(self, database_path: Path, retention_days: int) -> None:
        self.database_path = database_path
        self.retention_days = retention_days
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._create_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _create_schema(self) -> None:
        with closing(self._connect()) as connection, connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS telemetry_sessions (
                    session_hash TEXT PRIMARY KEY,
                    first_seen_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS telemetry_events (
                    event_id TEXT PRIMARY KEY,
                    session_hash TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    received_at TEXT NOT NULL,
                    client_version TEXT NOT NULL,
                    case_id TEXT,
                    payload_json TEXT NOT NULL,
                    FOREIGN KEY (session_hash) REFERENCES telemetry_sessions(session_hash)
                );
                CREATE INDEX IF NOT EXISTS telemetry_events_received_at ON telemetry_events(received_at);
                """
            )

    def record(self, events: list[TelemetryEvent]) -> int:
        received_at = datetime.now(UTC).isoformat()
        accepted = 0
        with closing(self._connect()) as connection, connection:
            self._purge_expired(connection, received_at)
            for event in events:
                session_hash = self._hash_session_id(event.session_id)
                connection.execute(
                    """
                    INSERT INTO telemetry_sessions (session_hash, first_seen_at, last_seen_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(session_hash) DO UPDATE SET last_seen_at = excluded.last_seen_at
                    """,
                    (session_hash, received_at, received_at),
                )
                result = connection.execute(
                    """
                    INSERT OR IGNORE INTO telemetry_events (
                        event_id, session_hash, event_type, occurred_at, received_at,
                        client_version, case_id, payload_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        event.event_id,
                        session_hash,
                        event.event_type,
                        event.occurred_at,
                        received_at,
                        event.client_version,
                        event.case_id,
                        json.dumps(event.payload, ensure_ascii=False, separators=(",", ":")),
                    ),
                )
                accepted += result.rowcount
            connection.execute(
                """
                DELETE FROM telemetry_sessions
                WHERE NOT EXISTS (
                    SELECT 1 FROM telemetry_events WHERE telemetry_events.session_hash = telemetry_sessions.session_hash
                )
                """
            )
        return accepted

    def _purge_expired(self, connection: sqlite3.Connection, received_at: str) -> None:
        cutoff = (datetime.fromisoformat(received_at) - timedelta(days=self.retention_days)).isoformat()
        connection.execute("DELETE FROM telemetry_events WHERE received_at < ?", (cutoff,))

    @staticmethod
    def _hash_session_id(session_id: str) -> str:
        return hashlib.sha256(session_id.encode("utf-8")).hexdigest()
