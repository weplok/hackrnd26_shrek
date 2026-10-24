from __future__ import annotations

from collections.abc import Awaitable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import uuid4

from redis.asyncio import Redis


@dataclass(frozen=True)
class AnonymousSession:
    session_id: str
    expires_at: datetime


class AnonymousSessionStore:
    def __init__(self, ttl_seconds: int) -> None:
        self.ttl = timedelta(seconds=ttl_seconds)
        self._sessions: dict[str, datetime] = {}

    async def create(self) -> AnonymousSession:
        now = datetime.now(UTC)
        expires_at = now + self.ttl
        session_id = str(uuid4())
        self._sessions = {key: expiry for key, expiry in self._sessions.items() if expiry > now}
        self._sessions[session_id] = expires_at
        return AnonymousSession(session_id=session_id, expires_at=expires_at)


class RedisAnonymousSessionStore:
    def __init__(self, client: Redis, ttl_seconds: int) -> None:
        self._client = client
        self._ttl_seconds = ttl_seconds

    async def create(self) -> AnonymousSession:
        now = datetime.now(UTC)
        expires_at = now + timedelta(seconds=self._ttl_seconds)
        session_id = str(uuid4())
        await cast(
            Awaitable[int],
            self._client.hset(
                f"sess:{session_id}",
                mapping={"created_at": now.isoformat(), "client_version": "unknown"},
            ),
        )
        await cast(Awaitable[bool], self._client.expire(f"sess:{session_id}", self._ttl_seconds))
        return AnonymousSession(session_id=session_id, expires_at=expires_at)
