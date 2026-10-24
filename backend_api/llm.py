from __future__ import annotations

import re
from typing import Protocol, cast

from openai.types.chat import ChatCompletionMessageParam

from .config import Settings


class ModelError(RuntimeError):
    pass


class ChatClient(Protocol):
    async def complete(self, model: str, messages: list[dict[str, str]], temperature: float) -> str: ...


class OpenAIChatClient:
    def __init__(self, settings: Settings) -> None:
        from openai import AsyncOpenAI

        self.client = AsyncOpenAI(base_url=settings.base_url, api_key=settings.api_key)

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
        return re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
