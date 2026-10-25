from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from backend_api.config import Settings
from backend_api.llm import (
    CircuitBreakingLlm,
    ClaudeCodeLlm,
    FakeLlm,
    FallbackLlm,
    ModelError,
    OpenAICompatibleLlm,
)


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
    openai_client.assert_called_once_with(
        base_url=settings.base_url,
        api_key=settings.api_key,
        timeout=settings.llm_request_timeout_seconds,
        max_retries=0,
    )
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


def test_claude_code_render_folds_system_and_history() -> None:
    system, prompt = ClaudeCodeLlm._render(
        [
            {"role": "system", "content": "S1"},
            {"role": "system", "content": "S2"},
            {"role": "user", "content": "u1"},
            {"role": "assistant", "content": "a1"},
            {"role": "user", "content": "u2"},
        ]
    )
    assert system == "S1\n\nS2"
    assert prompt == "Пользователь: u1\n\nАссистент: a1\n\nПользователь: u2"


def test_claude_code_single_message_is_passed_verbatim() -> None:
    system, prompt = ClaudeCodeLlm._render(
        [{"role": "system", "content": "S"}, {"role": "user", "content": "только это"}]
    )
    assert system == "S"
    assert prompt == "только это"


def test_claude_code_parses_cli_result_and_strips_think() -> None:
    settings = Settings(claude_code_fallback=True)
    proc = SimpleNamespace(
        returncode=0,
        communicate=AsyncMock(
            return_value=('{"subtype":"success","is_error":false,"result":"<think>h</think>Ответ"}'.encode(), b"")
        ),
        kill=lambda: None,
    )
    with patch("backend_api.llm.asyncio.create_subprocess_exec", AsyncMock(return_value=proc)):
        result = asyncio.run(ClaudeCodeLlm(settings).complete("npc", [{"role": "user", "content": "x"}], 0.7))
    assert result == "Ответ"


def test_claude_code_rejects_error_result() -> None:
    settings = Settings(claude_code_fallback=True)
    proc = SimpleNamespace(
        returncode=0,
        communicate=AsyncMock(return_value=(b'{"subtype":"error_during_execution","is_error":true}', b"")),
        kill=lambda: None,
    )
    with patch("backend_api.llm.asyncio.create_subprocess_exec", AsyncMock(return_value=proc)):
        with pytest.raises(ModelError, match="error result"):
            asyncio.run(ClaudeCodeLlm(settings).complete("npc", [{"role": "user", "content": "x"}], 0))


def test_build_llm_client_priority_uses_claude_alone_without_openai() -> None:
    from backend_api.app import build_llm_client

    client = build_llm_client(Settings(claude_code_priority=True))
    assert isinstance(client, ClaudeCodeLlm)


def test_build_llm_client_priority_falls_back_to_openai_when_configured() -> None:
    from backend_api.app import build_llm_client

    settings = Settings(
        base_url="https://provider.example/v1",
        api_key="secret",
        npc_model="npc",
        injection_judge_model="judge",
        alarm_judge_model="alarm",
        claude_code_priority=True,
    )
    client = build_llm_client(settings)
    assert isinstance(client, FallbackLlm)
    assert isinstance(client.primary, ClaudeCodeLlm)
    assert isinstance(client.fallback, CircuitBreakingLlm)


def test_fallback_uses_backup_only_when_primary_fails() -> None:
    primary = FakeLlm(["primary answer"])
    fallback = FakeLlm(["backup answer"])
    client = FallbackLlm(primary, fallback)
    assert asyncio.run(client.complete("npc", [], 0)) == "primary answer"
    assert fallback.calls == []

    failing = FallbackLlm(FakeLlm([ModelError("down")]), FakeLlm(["backup answer"]))
    assert asyncio.run(failing.complete("npc", [], 0)) == "backup answer"
