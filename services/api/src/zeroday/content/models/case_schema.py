# Generated from content/schemas by make codegen. Do not edit.

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from . import common_schema


class Kind(StrEnum):
    machine = 'machine'
    person = 'person'
    object = 'object'
    target = 'target'
    decoy = 'decoy'


class Type(StrEnum):
    password_fragment = 'password-fragment'
    file = 'file'
    name = 'name'
    phrase = 'phrase'
    config = 'config'
    token = 'token'
    physkey = 'physkey'
    legend = 'legend'


class Brief(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    client: common_schema.Text
    text: common_schema.Text
    illustration: str | None = None


class Scope(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    text: common_schema.Text
    rules: list[common_schema.Text] | None = None
    consequence: common_schema.Id | None = Field(
        None,
        description='Consequence shown when the player confirms an out-of-scope action.',
    )


class Segment(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: common_schema.Id
    label: common_schema.Text
    openAtStart: bool


class Socket(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: common_schema.Id
    accepts: common_schema.KeyRef
    label: common_schema.Text


class Clue(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: common_schema.Id
    type: Type
    text: common_schema.Text
    foundOn: common_schema.Id


class KeyRecipe(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    inputs: list[common_schema.Id] = Field(..., min_length=2)
    output: common_schema.Id
    label: common_schema.Text


class TrackConfig(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: common_schema.TrackId
    label: common_schema.Text
    start: int = Field(..., ge=0, le=100)


class RemediationOption(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: common_schema.Id
    text: common_schema.Text
    correct: bool


class Lock(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    sockets: list[Socket] = Field(..., min_length=1)


class Finding(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: common_schema.Id
    vuln: common_schema.VulnId
    node: common_schema.Id
    options: list[RemediationOption] = Field(..., min_length=2)
    explanation: common_schema.Text


class Report(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    findings: list[Finding] = Field(..., min_length=1)


class Case(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    schemaVersion: common_schema.SchemaVersion
    id: common_schema.CaseId
    title: common_schema.Text
    brief: Brief
    scope: Scope
    difficulty: common_schema.DifficultyOverride | None = None
    segments: list[Segment] = Field(..., min_length=1)
    nodes: list[Node] = Field(..., min_length=1)
    edges: list[Edge]
    clues: list[Clue]
    keyRecipes: list[KeyRecipe]
    npcs: list[common_schema.Id]
    objectives: list[Objective] = Field(..., min_length=1)
    tracks: list[TrackConfig] = Field(..., min_length=1)
    systems: list[common_schema.SystemId]
    report: Report
    ranks: list[Rank] = Field(..., min_length=1)
    checkpoints: list[Checkpoint]


class Node(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: common_schema.Id
    kind: Kind
    label: common_schema.Text
    segment: common_schema.Id
    position: common_schema.Position
    inScope: bool
    revealedBy: common_schema.Condition | None = None
    scanNoise: int = Field(..., ge=0, le=100)
    npc: common_schema.Id | None = Field(None, description='NPC behind a person node.')
    exploits: list[Exploit]
    failHints: dict[common_schema.VulnId, common_schema.Text] = Field(
        ..., description='Hint per wrong vulnerability guess, keyed by SL-xx.'
    )
    lock: Lock | None = None
    onCompromise: common_schema.Effects


class Exploit(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    vuln: common_schema.VulnId
    requires: common_schema.Condition | None = None
    puzzleParams: dict[str, Any] = Field(
        ...,
        description='Archetype-specific generator data; the puzzle plugin validates it.',
    )
    knobs: common_schema.Knobs | None = None
    effects: common_schema.Effects | None = None


class Edge(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    from_: common_schema.Id = Field(..., alias='from')
    to: common_schema.Id
    revealedBy: common_schema.Condition | None = None


class Objective(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: common_schema.Id
    title: common_schema.Text
    doneWhen: common_schema.Condition
    parent: common_schema.Id | None = None
    checkpoint: bool | None = None


class Rank(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: common_schema.Id
    title: common_schema.Text
    when: common_schema.Condition | None = None


class Checkpoint(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: common_schema.Id
    label: common_schema.Text
    when: common_schema.Condition


Case.model_rebuild()
Node.model_rebuild()
