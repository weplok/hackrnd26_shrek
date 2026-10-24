# Generated from content/schemas by make codegen. Do not edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from . import common_schema


class Consequence(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: common_schema.Id
    title: common_schema.Text
    facts: list[common_schema.Text] = Field(..., min_length=1)
    reputationDelta: int


class Consequences(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    schemaVersion: common_schema.SchemaVersion
    items: list[Consequence] = Field(..., min_length=1)
