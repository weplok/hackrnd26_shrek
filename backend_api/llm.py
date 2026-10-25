from __future__ import annotations

import re
from collections.abc import Callable, Iterable
from time import monotonic
from typing import Protocol, cast

from openai.types.chat import ChatCompletionMessageParam

from .config import Settings

_THINK_BLOCK = re.compile(r"<think>.*?</think>", flags=re.DOTALL)


def _strip_think(content: str) -> str:
    return _THINK_BLOCK.sub("", content).strip()


class ModelError(RuntimeError):
    pass


class LlmClient(Protocol):
    async def complete(
        self, model: str, messages: list[dict[str, str]], temperature: float, max_tokens: int | None = None
    ) -> str: ...


class OpenAICompatibleLlm:
    def __init__(self, settings: Settings) -> None:
        from openai import AsyncOpenAI

        self.client = AsyncOpenAI(
            base_url=settings.base_url,
            api_key=settings.api_key,
            timeout=settings.llm_request_timeout_seconds,
            max_retries=settings.llm_max_retries,
        )

    async def complete(
        self, model: str, messages: list[dict[str, str]], temperature: float, max_tokens: int | None = None
    ) -> str:
        try:
            result = await self.client.chat.completions.create(
                model=model,
                messages=cast(list[ChatCompletionMessageParam], messages),
                temperature=temperature,
                **({"max_tokens": max_tokens} if max_tokens else {}),
            )
        except Exception as error:
            raise ModelError("OpenAI-compatible API request failed") from error
        content = result.choices[0].message.content if result.choices else None
        if not content:
            raise ModelError("OpenAI-compatible API returned an empty response")
        response = _strip_think(content)
        if not response:
            raise ModelError("OpenAI-compatible API returned an empty response")
        return response


class FakeLlm:
    def __init__(self, responses: Iterable[str | Exception]) -> None:
        self._responses = iter(responses)
        self.calls: list[tuple[str, list[dict[str, str]], float]] = []

    async def complete(
        self, model: str, messages: list[dict[str, str]], temperature: float, max_tokens: int | None = None
    ) -> str:
        self.calls.append((model, messages, temperature))
        try:
            response = next(self._responses)
        except StopIteration as error:
            raise AssertionError("FakeLlm has no configured response") from error
        if isinstance(response, Exception):
            raise response
        return response


class CircuitBreakingLlm:
    def __init__(
        self,
        client: LlmClient,
        *,
        failure_threshold: int = 3,
        recovery_seconds: int = 30,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self.client = client
        self.failure_threshold = failure_threshold
        self.recovery_seconds = recovery_seconds
        self.clock = clock
        self._consecutive_failures = 0
        self._opened_at: float | None = None

    async def complete(
        self, model: str, messages: list[dict[str, str]], temperature: float, max_tokens: int | None = None
    ) -> str:
        now = self.clock()
        if self._opened_at is not None and now - self._opened_at < self.recovery_seconds:
            raise ModelError("LLM circuit breaker is open")
        try:
            response = await self.client.complete(model, messages, temperature, max_tokens)
        except ModelError:
            self._consecutive_failures += 1
            if self._consecutive_failures >= self.failure_threshold:
                self._opened_at = now
            raise
        self._consecutive_failures = 0
        self._opened_at = None
        return response
