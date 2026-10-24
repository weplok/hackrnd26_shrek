from __future__ import annotations

import unittest
from datetime import UTC, datetime

from backend_api.rate_limit import RateLimitExceeded, RedisFixedWindowRateLimiter
from backend_api.sessions import RedisAnonymousSessionStore


class FakeRedis:
    def __init__(self) -> None:
        self.hashes: dict[str, dict[str, str]] = {}
        self.ttls: dict[str, int] = {}
        self.allowed = True

    async def hset(self, key: str, mapping: dict[str, str]) -> int:
        self.hashes[key] = mapping
        return len(mapping)

    async def expire(self, key: str, seconds: int) -> bool:
        self.ttls[key] = seconds
        return True

    async def eval(self, _: str, __: int, key: str, window_seconds: str, limit: str) -> list[int]:
        self.ttls[key] = int(window_seconds)
        return [1, int(window_seconds)] if self.allowed else [0, int(limit)]


class RedisStoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_session_store_sets_ttl(self) -> None:
        client = FakeRedis()

        session = await RedisAnonymousSessionStore(client, 60).create()  # type: ignore[arg-type]

        self.assertIn(f"sess:{session.session_id}", client.hashes)
        self.assertEqual(client.ttls[f"sess:{session.session_id}"], 60)
        self.assertGreater(session.expires_at, datetime.now(UTC))

    async def test_rate_limiter_maps_redis_rejection(self) -> None:
        client = FakeRedis()
        client.allowed = False

        with self.assertRaises(RateLimitExceeded) as error:
            await RedisFixedWindowRateLimiter(client, 60).check("session:ip:127.0.0.1", 10)  # type: ignore[arg-type]

        self.assertEqual(error.exception.retry_after, 10)
