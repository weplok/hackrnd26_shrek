from __future__ import annotations

from collections.abc import Awaitable
from dataclasses import dataclass
from time import monotonic
from typing import cast

from redis.asyncio import Redis


class RateLimitExceeded(RuntimeError):
    def __init__(self, retry_after: int) -> None:
        super().__init__("Rate limit exceeded")
        self.retry_after = retry_after


@dataclass
class _Window:
    count: int
    reset_at: float


class FixedWindowRateLimiter:
    def __init__(self, window_seconds: int) -> None:
        self.window_seconds = window_seconds
        self._windows: dict[str, _Window] = {}

    async def check(self, key: str, limit: int) -> None:
        now = monotonic()
        self._windows = {key: window for key, window in self._windows.items() if now < window.reset_at}
        window = self._windows.get(key)
        if window is None or now >= window.reset_at:
            self._windows[key] = _Window(count=1, reset_at=now + self.window_seconds)
            return
        if window.count >= limit:
            retry_after = max(1, int(window.reset_at - now + 0.999))
            raise RateLimitExceeded(retry_after)
        window.count += 1


class RedisFixedWindowRateLimiter:
    _SCRIPT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
if count > tonumber(ARGV[2]) then return {0, ttl} end
return {1, ttl}
"""

    def __init__(self, client: Redis, window_seconds: int) -> None:
        self._client = client
        self._window_seconds = window_seconds

    async def check(self, key: str, limit: int) -> None:
        allowed, retry_after = await cast(
            Awaitable[list[int]],
            self._client.eval(self._SCRIPT, 1, f"rl:{key}", str(self._window_seconds), str(limit)),
        )
        if int(allowed) == 0:
            raise RateLimitExceeded(max(1, int(retry_after)))
