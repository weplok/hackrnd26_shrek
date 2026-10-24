# Generated from content/schemas by make codegen. Do not edit.

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from . import common_schema


class NoiseProfile(StrEnum):
    quiet = 'quiet'
    moderate = 'moderate'
    loud = 'loud'


class KillChainStage(StrEnum):
    recon = 'recon'
    initial_access = 'initial_access'
    credential_access = 'credential_access'
    lateral_movement = 'lateral_movement'
    privilege_escalation = 'privilege_escalation'
    defense_evasion = 'defense_evasion'
    collection = 'collection'


class Vulnerability(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: common_schema.VulnId
    title: common_schema.Text
    archetype: common_schema.Archetype
    noiseProfile: NoiseProfile
    killChainStage: KillChainStage
    codexCardId: common_schema.VulnId
    introducedInLevel: int = Field(..., ge=1, le=3)


class Vulnerabilities(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    schemaVersion: common_schema.SchemaVersion
    items: list[Vulnerability] = Field(..., min_length=1)
