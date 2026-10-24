from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Session:
    npc_id: str
    user_uuid: str
    trust_level: int
    history: list[dict[str, str]]


class SessionStore:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._create_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _create_schema(self) -> None:
        with closing(self._connect()) as connection, connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS dialogue_sessions (
                    npc_id TEXT NOT NULL,
                    user_uuid TEXT NOT NULL,
                    trust_level INTEGER NOT NULL,
                    history_json TEXT NOT NULL,
                    PRIMARY KEY (npc_id, user_uuid)
                )
                """
            )

    def get_or_create(self, npc_id: str, user_uuid: str, initial_trust_level: int) -> Session:
        with closing(self._connect()) as connection, connection:
            row = connection.execute(
                "SELECT npc_id, user_uuid, trust_level, history_json "
                "FROM dialogue_sessions WHERE npc_id = ? AND user_uuid = ?",
                (npc_id, user_uuid),
            ).fetchone()
            if row is None:
                connection.execute(
                    "INSERT INTO dialogue_sessions (npc_id, user_uuid, trust_level, history_json) VALUES (?, ?, ?, ?)",
                    (npc_id, user_uuid, initial_trust_level, "[]"),
                )
                return Session(npc_id, user_uuid, initial_trust_level, [])
        return Session(
            npc_id=row["npc_id"],
            user_uuid=row["user_uuid"],
            trust_level=row["trust_level"],
            history=json.loads(row["history_json"]),
        )

    def save(self, session: Session) -> None:
        with closing(self._connect()) as connection, connection:
            connection.execute(
                "UPDATE dialogue_sessions SET trust_level = ?, history_json = ? WHERE npc_id = ? AND user_uuid = ?",
                (
                    session.trust_level,
                    json.dumps(session.history, ensure_ascii=False),
                    session.npc_id,
                    session.user_uuid,
                ),
            )

    def delete(self, npc_id: str, user_uuid: str) -> bool:
        with closing(self._connect()) as connection, connection:
            result = connection.execute(
                "DELETE FROM dialogue_sessions WHERE npc_id = ? AND user_uuid = ?", (npc_id, user_uuid)
            )
        return result.rowcount > 0
