# Generated from content/schemas by make codegen. Do not edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from . import common_schema


class Slide(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    text: common_schema.Text
    illustration: str | None = None


class Interlude(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: common_schema.Id
    title: common_schema.Text
    slides: list[Slide] = Field(..., min_length=1)
    effects: common_schema.Effects | None = None


class Interludes(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    schemaVersion: common_schema.SchemaVersion
    items: list[Interlude]
