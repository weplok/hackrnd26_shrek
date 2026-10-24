from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr, ValidationInfo, field_validator


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
    trust_points: int


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"


class SessionResponse(BaseModel):
    session_id: str
    expires_at: datetime


JudgeVerdict = Literal["continue", "ended", "noticed"]


class TrustVerdict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    verdict: JudgeVerdict
    trust_change: Literal[-7, -4, -2, 0, 2, 5, 8]


TelemetryEventName = Literal[
    "case_started",
    "case_finished",
    "step_finished",
    "puzzle_attempted",
    "puzzle_finished",
    "scope_warning",
    "scope_confirmed",
    "checkpoint_restored",
    "save_restored",
    "offline_mode",
    "client_error",
]
TelemetryValue = StrictStr | StrictInt | StrictBool
TELEMETRY_PAYLOAD_KEYS: dict[TelemetryEventName, frozenset[str]] = {
    "case_started": frozenset(),
    "case_finished": frozenset({"outcome", "action_count"}),
    "step_finished": frozenset({"step_id"}),
    "puzzle_attempted": frozenset({"puzzle_id", "attempt"}),
    "puzzle_finished": frozenset({"puzzle_id", "outcome", "attempt"}),
    "scope_warning": frozenset({"node_id"}),
    "scope_confirmed": frozenset({"node_id"}),
    "checkpoint_restored": frozenset({"checkpoint_id"}),
    "save_restored": frozenset({"save_version"}),
    "offline_mode": frozenset({"reason"}),
    "client_error": frozenset({"stack", "last_commands", "seed"}),
}


class TelemetryEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    event_id: StrictStr
    event_type: TelemetryEventName
    occurred_at: StrictStr
    session_id: StrictStr
    client_version: StrictStr
    case_id: StrictStr | None = None
    payload: dict[StrictStr, TelemetryValue] = Field(default_factory=dict)

    @field_validator("event_id")
    @classmethod
    def require_event_uuid(cls, value: str) -> str:
        try:
            UUID(value)
        except ValueError as error:
            raise ValueError("must be a UUID") from error
        return value

    @field_validator("occurred_at")
    @classmethod
    def require_timestamp(cls, value: str) -> str:
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("must be an ISO 8601 timestamp") from error
        return value

    @field_validator("session_id", "client_version", "case_id")
    @classmethod
    def require_short_text(cls, value: str | None) -> str | None:
        if value is not None and (not value.strip() or len(value) > 128):
            raise ValueError("must contain 1 to 128 characters")
        return value

    @field_validator("payload")
    @classmethod
    def validate_payload(
        cls, value: dict[str, TelemetryValue], info: ValidationInfo
    ) -> dict[str, TelemetryValue]:
        event_type: TelemetryEventName | None = info.data.get("event_type")
        if event_type is None:
            raise ValueError("event_type is required")
        allowed_keys = TELEMETRY_PAYLOAD_KEYS.get(event_type)
        if allowed_keys is None or not set(value).issubset(allowed_keys):
            raise ValueError("payload contains unsupported fields")
        if any(len(str(item)) > 4_096 for item in value.values()):
            raise ValueError("payload values must not exceed 4096 characters")
        return value


class TelemetryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    events: Annotated[list[TelemetryEvent], Field(min_length=1, max_length=20)]

    @field_validator("events")
    @classmethod
    def require_unique_event_ids(cls, value: list[TelemetryEvent]) -> list[TelemetryEvent]:
        if len({event.event_id for event in value}) != len(value):
            raise ValueError("event_id values must be unique")
        return value


class TelemetryResponse(BaseModel):
    accepted: int
