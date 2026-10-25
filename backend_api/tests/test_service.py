from __future__ import annotations

import asyncio

from backend_api.characters import CharacterProfile
from backend_api.config import Settings
from backend_api.service import DialogueService, _parse_trust_verdict


class CapturingLlm:
    def __init__(self) -> None:
        self.calls: list[list[dict[str, str]]] = []

    async def complete(
        self, model: str, messages: list[dict[str, str]], temperature: float, max_tokens: int | None = None
    ) -> str:
        self.calls.append(messages)
        return "Привет."


def test_npc_prompt_requires_plausible_missing_details() -> None:
    client = CapturingLlm()
    service = DialogueService(Settings(), object(), object(), client)  # type: ignore[arg-type]
    profile = CharacterProfile(npc_id="npc", data={}, source_text="имя: Ира")

    asyncio.run(service._generate_npc_response(profile, [], "Как зовут куратора?", 50))

    system_prompt = client.calls[0][0]["content"]
    user_prompt = client.calls[0][-1]["content"]
    for prompt in (system_prompt, user_prompt):
        assert "придумай правдоподобную деталь" in prompt
        assert "Не говори, что ты ИИ или чего-то не знаешь" in prompt


def test_trust_change_supports_requested_ranges() -> None:
    assert _parse_trust_verdict('{"verdict":"continue","trust_change":21}').trust_change == 21
    assert _parse_trust_verdict('{"verdict":"continue","trust_change":99}').trust_change == 30
    assert _parse_trust_verdict('{"verdict":"continue","trust_change":-99}').trust_change == -15
