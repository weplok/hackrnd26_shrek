from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, StrictStr, field_validator


class DialogueRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    npc_id: StrictStr
    uuid: StrictStr
    message: StrictStr

    @field_validator("npc_id", "uuid", "message")
    @classmethod
    def require_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be empty")
        return value


class DialogueResponse(BaseModel):
    answer: str
    verdict: Literal["continue", "ended", "noticed"]


JudgeVerdict = Literal["continue", "ended", "noticed"]


class TrustVerdict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    verdict: JudgeVerdict
    trust_change: Literal[-7, -4, -2, 0, 2, 5, 8]
