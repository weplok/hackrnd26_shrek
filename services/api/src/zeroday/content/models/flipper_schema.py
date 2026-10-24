# Generated from content/schemas by make codegen. Do not edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, RootModel

from . import common_schema


class TextItem(RootModel[str]):
    root: str = Field(..., max_length=90, min_length=1)


class Flipper(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    schemaVersion: common_schema.SchemaVersion
    lines: list[FlipperLine] = Field(..., min_length=1)


class Trigger(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    event: common_schema.EventType
    when: common_schema.Condition | None = None


class FlipperLine(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: common_schema.Id
    trigger: Trigger
    text: list[TextItem] = Field(..., min_length=1)
    cooldownTicks: int = Field(..., ge=0)
    minLevel: int | None = Field(None, ge=1, le=3)
    maxLevel: int | None = Field(None, ge=1, le=3)


Flipper.model_rebuild()
