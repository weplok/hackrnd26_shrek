from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from threading import Lock
from uuid import uuid4


@dataclass(frozen=True)
class AnonymousSession:
    session_id: str
    expires_at: datetime


class AnonymousSessionStore:
    def __init__(self, ttl_seconds: int) -> None:
        self.ttl = timedelta(seconds=ttl_seconds)
        self._sessions: dict[str, datetime] = {}
        self._lock = Lock()

    def create(self) -> AnonymousSession:
        now = datetime.now(UTC)
        expires_at = now + self.ttl
        session_id = str(uuid4())
        with self._lock:
            self._sessions = {key: expiry for key, expiry in self._sessions.items() if expiry > now}
            self._sessions[session_id] = expires_at
        return AnonymousSession(session_id=session_id, expires_at=expires_at)
