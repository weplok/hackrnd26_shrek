from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from backend_api.config import Settings
from backend_api.llm import CircuitBreakingLlm, FakeLlm, ModelError, OpenAICompatibleLlm


def test_openai_compatible_adapter_strips_think_blocks() -> None:
    completion = AsyncMock(
        return_value=SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="<think>hidden</think>Ответ NPC"))]
        )
    )
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=completion)))
    settings = Settings(base_url="https://provider.example/v1", api_key="secret")

    with patch("openai.AsyncOpenAI", return_value=client) as openai_client:
        result = asyncio.run(
            OpenAICompatibleLlm(settings).complete("npc", [{"role": "user", "content": "Привет"}], 0.7)
        )

    assert result == "Ответ NPC"
    openai_client.assert_called_once_with(base_url=settings.base_url, api_key=settings.api_key)
    completion.assert_awaited_once_with(
        model="npc", messages=[{"role": "user", "content": "Привет"}], temperature=0.7
    )


def test_openai_compatible_adapter_normalizes_provider_errors() -> None:
    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=AsyncMock(side_effect=RuntimeError("offline"))))
    )
    settings = Settings(base_url="https://provider.example/v1", api_key="secret")

    with patch("openai.AsyncOpenAI", return_value=client):
        with pytest.raises(ModelError, match="OpenAI-compatible API request failed"):
            asyncio.run(OpenAICompatibleLlm(settings).complete("npc", [], 0))


def test_openai_compatible_adapter_rejects_response_without_visible_content() -> None:
    completion = AsyncMock(
        return_value=SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="<think>hidden</think>"))])
    )
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=completion)))
    settings = Settings(base_url="https://provider.example/v1", api_key="secret")

    with patch("openai.AsyncOpenAI", return_value=client):
        with pytest.raises(ModelError, match="empty response"):
            asyncio.run(OpenAICompatibleLlm(settings).complete("npc", [], 0))


def test_circuit_breaker_rejects_calls_until_recovery_succeeds() -> None:
    now = [0.0]
    fake = FakeLlm([ModelError("one"), ModelError("two"), ModelError("three"), "recovered"])
    client = CircuitBreakingLlm(fake, clock=lambda: now[0])

    for _ in range(3):
        with pytest.raises(ModelError):
            asyncio.run(client.complete("npc", [], 0))

    with pytest.raises(ModelError, match="circuit breaker is open"):
        asyncio.run(client.complete("npc", [], 0))
    assert len(fake.calls) == 3

    now[0] = 30.0
    assert asyncio.run(client.complete("npc", [], 0)) == "recovered"
