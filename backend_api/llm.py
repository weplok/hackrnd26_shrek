from __future__ import annotations

import asyncio
import json
import logging
import re
import tempfile
from collections.abc import Callable, Iterable
from time import monotonic
from typing import Protocol, cast

from openai.types.chat import ChatCompletionMessageParam

from .config import Settings

logger = logging.getLogger("backend_api.llm")

_THINK_BLOCK = re.compile(r"<think>.*?</think>", flags=re.DOTALL)


def _strip_think(content: str) -> str:
    return _THINK_BLOCK.sub("", content).strip()


class ModelError(RuntimeError):
    pass


class LlmClient(Protocol):
    async def complete(self, model: str, messages: list[dict[str, str]], temperature: float) -> str: ...


class OpenAICompatibleLlm:
    def __init__(self, settings: Settings) -> None:
        from openai import AsyncOpenAI

        self.client = AsyncOpenAI(
            base_url=settings.base_url,
            api_key=settings.api_key,
            timeout=settings.llm_timeout_seconds,
            max_retries=settings.llm_max_retries,
        )

    async def complete(self, model: str, messages: list[dict[str, str]], temperature: float) -> str:
        try:
            result = await self.client.chat.completions.create(
                model=model,
                messages=cast(list[ChatCompletionMessageParam], messages),
                temperature=temperature,
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


# Role labels for rendering history into the single prompt the Claude Code CLI accepts.
_ROLE_LABELS = {"user": "Пользователь", "assistant": "Ассистент"}


class ClaudeCodeLlm:
    """Backup client that drives the locally installed Claude Code CLI (`claude -p`).

    Used when the primary OpenAI-compatible endpoint is unavailable. The CLI runs
    non-interactively with a single Claude model (Sonnet by default); the OpenAI
    `model` argument is ignored because those ids are not valid Claude models, and
    `temperature` is ignored because print mode has no such flag.
    """

    def __init__(self, settings: Settings) -> None:
        self.bin = settings.claude_code_bin
        self.model = settings.claude_code_model
        self.timeout = settings.llm_timeout_seconds
        # Run from a neutral directory so project CLAUDE.md is never auto-discovered.
        self.cwd = tempfile.gettempdir()

    @staticmethod
    def _render(messages: list[dict[str, str]]) -> tuple[str, str]:
        system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
        conversation = [m for m in messages if m["role"] != "system"]
        if len(conversation) == 1:
            return system, conversation[0]["content"]
        prompt = "\n\n".join(f"{_ROLE_LABELS.get(m['role'], m['role'])}: {m['content']}" for m in conversation)
        return system, prompt

    async def complete(self, model: str, messages: list[dict[str, str]], temperature: float) -> str:
        system, prompt = self._render(messages)
        args = [
            self.bin,
            "-p",
            "--model",
            self.model,
            "--output-format",
            "json",
            "--strict-mcp-config",
            "--restricted",
            "--disable-slash-commands",
            "--permission-prompts",
            "none",
        ]
        if system:
            args += ["--system-prompt", system]
        try:
            proc = await asyncio.create_subprocess_exec(
                *args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.cwd,
            )
        except OSError as error:
            raise ModelError("Claude Code CLI could not be started") from error
        try:
            stdout, _ = await asyncio.wait_for(proc.communicate(prompt.encode()), self.timeout)
        except TimeoutError as error:
            proc.kill()
            raise ModelError("Claude Code CLI timed out") from error
        if proc.returncode != 0:
            raise ModelError("Claude Code CLI exited with a non-zero status")
        try:
            payload = json.loads(stdout)
        except (json.JSONDecodeError, ValueError) as error:
            raise ModelError("Claude Code CLI returned invalid JSON") from error
        if payload.get("is_error") or payload.get("subtype") != "success":
            raise ModelError("Claude Code CLI reported an error result")
        response = _strip_think(str(payload.get("result", "")))
        if not response:
            raise ModelError("Claude Code CLI returned an empty response")
        return response


class FallbackLlm:
    """Try the primary client; on a model error fall back to the backup client."""

    def __init__(self, primary: LlmClient, fallback: LlmClient) -> None:
        self.primary = primary
        self.fallback = fallback

    async def complete(self, model: str, messages: list[dict[str, str]], temperature: float) -> str:
        try:
            return await self.primary.complete(model, messages, temperature)
        except ModelError:
            logger.warning("primary LLM unavailable, falling back to Claude Code CLI")
            return await self.fallback.complete(model, messages, temperature)


class FakeLlm:
    def __init__(self, responses: Iterable[str | Exception]) -> None:
        self._responses = iter(responses)
        self.calls: list[tuple[str, list[dict[str, str]], float]] = []

    async def complete(self, model: str, messages: list[dict[str, str]], temperature: float) -> str:
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

    async def complete(self, model: str, messages: list[dict[str, str]], temperature: float) -> str:
        now = self.clock()
        if self._opened_at is not None and now - self._opened_at < self.recovery_seconds:
            raise ModelError("LLM circuit breaker is open")
        try:
            response = await self.client.complete(model, messages, temperature)
        except ModelError:
            self._consecutive_failures += 1
            if self._consecutive_failures >= self.failure_threshold:
                self._opened_at = now
            raise
        self._consecutive_failures = 0
        self._opened_at = None
        return response
