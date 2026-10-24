# Generated from content/schemas by make codegen. Do not edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from . import common_schema


class LearnMoreItem(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    title: common_schema.Text
    url: str = Field(..., pattern='^https://')


class CodexCard(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    schemaVersion: common_schema.SchemaVersion
    id: common_schema.VulnId
    realTerm: common_schema.Text
    whyItWorks: common_schema.Text
    defense: common_schema.Text
    realCase: common_schema.Text
    law: common_schema.Text
    learnMore: list[LearnMoreItem] = Field(..., description='Legal training resources only.')
