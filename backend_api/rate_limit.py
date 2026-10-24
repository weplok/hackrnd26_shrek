from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
from time import monotonic


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
        self._lock = Lock()

    def check(self, key: str, limit: int) -> None:
        now = monotonic()
        with self._lock:
            self._windows = {key: window for key, window in self._windows.items() if now < window.reset_at}
            window = self._windows.get(key)
            if window is None or now >= window.reset_at:
                self._windows[key] = _Window(count=1, reset_at=now + self.window_seconds)
                return
            if window.count >= limit:
                retry_after = max(1, int(window.reset_at - now + 0.999))
                raise RateLimitExceeded(retry_after)
            window.count += 1
