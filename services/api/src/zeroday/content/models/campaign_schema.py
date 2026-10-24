# Generated from content/schemas by make codegen. Do not edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from . import common_schema


class Interlude(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    afterCase: common_schema.CaseId
    interlude: common_schema.Id


class Level(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: common_schema.LevelId
    title: common_schema.Text
    accent: str = Field(..., pattern='^#[0-9a-fA-F]{6}$')
    difficulty: common_schema.Difficulty
    cases: list[common_schema.CaseId] = Field(..., min_length=1)


class Campaign(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    schemaVersion: common_schema.SchemaVersion
    contentVersion: str = Field(..., pattern='^[0-9]+\\.[0-9]+\\.[0-9]+$')
    levels: list[Level] = Field(..., min_length=1)
    interludes: list[Interlude]
