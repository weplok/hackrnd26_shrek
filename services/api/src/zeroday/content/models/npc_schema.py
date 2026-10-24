# Generated from content/schemas by make codegen. Do not edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from . import common_schema


class Persona(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    role: common_schema.Text
    character: common_schema.Text
    speechStyle: common_schema.Text


class Suspicion(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    start: int = Field(..., ge=0, le=100)
    lockAt: int = Field(..., ge=1, le=100)
    cooldownTicks: int | None = Field(None, ge=0)


class Llm(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    systemPromptRef: str = Field(..., min_length=1)
    allowedFactIds: list[common_schema.Id]


class Fact(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: common_schema.Id
    text: common_schema.Text
    grantsClue: common_schema.Id | None = None


class Line(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: common_schema.Id
    text: str = Field(..., max_length=240, min_length=1)


class Npc(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    schemaVersion: common_schema.SchemaVersion
    id: common_schema.Id
    name: common_schema.Text
    persona: Persona
    suspicion: Suspicion
    greeting: common_schema.Id
    facts: list[Fact]
    rules: list[Rule] = Field(..., min_length=1)
    scriptedLines: list[Line] = Field(..., min_length=1)
    llm: Llm | None = None


class Rule(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: common_schema.Id
    intent: common_schema.Id | None = None
    tones: list[common_schema.Tone] | None = Field(None, min_length=1)
    presented: list[common_schema.Id] | None = Field(
        None, description='Clue or key ids the player must attach to the line.'
    )
    missing: list[common_schema.Id] | None = Field(
        None, description='Clue or key ids that must not be attached.'
    )
    when: common_schema.Condition | None = None
    suspicion: int = Field(..., ge=-100, le=100)
    reply: common_schema.Id
    revealFacts: list[common_schema.Id] | None = None
    effects: common_schema.Effects | None = None


Npc.model_rebuild()
