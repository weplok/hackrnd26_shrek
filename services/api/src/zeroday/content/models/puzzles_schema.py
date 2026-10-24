# Generated from content/schemas by make codegen. Do not edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from . import common_schema


class Puzzle(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    archetype: common_schema.Archetype
    vuln: common_schema.VulnId
    title: common_schema.Text


class Puzzles(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    schemaVersion: common_schema.SchemaVersion
    items: list[Puzzle] = Field(..., min_length=1)
