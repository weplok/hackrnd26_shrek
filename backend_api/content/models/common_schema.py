# Generated from content/schemas by make codegen. Do not edit.

from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, RootModel


class Common(RootModel[Any]):
    root: Any = Field(..., description='Shared definitions for ZERO DAY content, schemaVersion 1.', title='Common')


class SchemaVersion(RootModel[Literal[1]]):
    root: Literal[1]


class Id(RootModel[str]):
    root: str = Field(..., pattern='^[a-z][a-z0-9_]*$')


class IdList(RootModel[list[Id]]):
    root: list[Id] = Field(..., min_length=1)


class VulnId(RootModel[str]):
    root: str = Field(..., pattern='^SL-[0-9]{2}$')


class CaseId(RootModel[str]):
    root: str = Field(..., pattern='^L[1-9]C[1-9]$')


class LevelId(RootModel[str]):
    root: str = Field(..., pattern='^L[1-9]$')


class KeyRef(RootModel[str]):
    root: str = Field(
        ...,
        description='Key reference in a lock socket, for example key:domain_admin.',
        pattern='^key:[a-z][a-z0-9_]*$',
    )


class Text(RootModel[str]):
    root: str = Field(..., min_length=1)


class Archetype(StrEnum):
    sticker = 'sticker'
    password_wheel = 'password-wheel'
    open_door = 'open-door'
    expired_patch = 'expired-patch'
    legend_mosaic = 'legend-mosaic'
    trust_path = 'trust-path'
    forgotten_key = 'forgotten-key'
    wall = 'wall'
    tired_guard = 'tired-guard'
    open_port = 'open-port'
    chatty_logs = 'chatty-logs'
    code_intercept = 'code-intercept'
    blind_spot = 'blind-spot'


class TrackId(StrEnum):
    alarm = 'alarm'
    logs = 'logs'
    antifraud = 'antifraud'
    attention = 'attention'


class SystemId(StrEnum):
    tracks = 'tracks'
    hunter = 'hunter'
    npcCooldown = 'npcCooldown'
    objectives = 'objectives'
    flipper = 'flipper'
    caughtCheck = 'caughtCheck'


class NodeStateValue(StrEnum):
    hidden = 'hidden'
    dim = 'dim'
    visible = 'visible'
    untouched = 'untouched'
    compromised = 'compromised'
    secured = 'secured'
    calm = 'calm'
    alerted = 'alerted'
    detected = 'detected'
    scanned = 'scanned'


class EventType(StrEnum):
    CaseStarted = 'CaseStarted'
    NodeScanned = 'NodeScanned'
    NodesRevealed = 'NodesRevealed'
    CluesFound = 'CluesFound'
    TrackChanged = 'TrackChanged'
    PuzzleOpened = 'PuzzleOpened'
    ScopeWarning = 'ScopeWarning'
    PuzzleCancelled = 'PuzzleCancelled'
    PuzzleSolved = 'PuzzleSolved'
    PuzzleFailed = 'PuzzleFailed'
    ExploitSucceeded = 'ExploitSucceeded'
    ExploitMismatched = 'ExploitMismatched'
    KeyAssembled = 'KeyAssembled'
    CombineFailed = 'CombineFailed'
    SocketFilled = 'SocketFilled'
    LockOpened = 'LockOpened'
    NpcReplied = 'NpcReplied'
    NpcFactRevealed = 'NpcFactRevealed'
    NpcSuspicionChanged = 'NpcSuspicionChanged'
    NpcLocked = 'NpcLocked'
    ScopeViolated = 'ScopeViolated'
    ConsequenceShown = 'ConsequenceShown'
    TimePassed = 'TimePassed'
    RemediationChosen = 'RemediationChosen'
    NodeSecured = 'NodeSecured'
    CaseCompleted = 'CaseCompleted'
    CheckpointRestored = 'CheckpointRestored'
    CommandRejected = 'CommandRejected'
    Ticked = 'Ticked'
    ObjectiveCompleted = 'ObjectiveCompleted'
    HunterMoved = 'HunterMoved'
    FlipperMoodChanged = 'FlipperMoodChanged'
    FlipperSaid = 'FlipperSaid'
    Caught = 'Caught'


class Position(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    x: float
    y: float


class Threshold(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    track: TrackId
    value: int = Field(..., ge=0, le=100)


class NodeState(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    node: Id
    state: NodeStateValue


class ConditionNodeState(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    nodeState: NodeState


class ConditionHasClue(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    hasClue: Id


class ConditionHasKey(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    hasKey: Id


class ConditionSegmentOpen(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    segmentOpen: Id


class ConditionFlag(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    flag: Id


class NpcFactRevealed(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    npc: Id
    fact: Id


class ConditionNpcFactRevealed(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    npcFactRevealed: NpcFactRevealed


class ConditionTrackBelow(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    trackBelow: Threshold


class ConditionTrackAbove(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    trackAbove: Threshold


class ConditionLockFilled(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    lockFilled: Id


class ConditionTickAtLeast(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    tickAtLeast: int = Field(..., ge=0)


class EffectRevealNodes(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    revealNodes: IdList


class EffectGrantClues(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    grantClues: IdList


class EffectOpenSegment(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    openSegment: Id


class EffectSetFlag(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    setFlag: Id


class AddTrack(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    track: TrackId
    delta: int = Field(..., ge=-100, le=100)


class EffectAddTrack(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    addTrack: AddTrack


class EffectUnlockCodex(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    unlockCodex: VulnId


class EffectFlipperSay(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    flipperSay: Id


class EffectCompleteObjective(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    completeObjective: Id


class Frequency(StrEnum):
    low = 'low'
    medium = 'medium'
    high = 'high'


class Depth(StrEnum):
    nudge = 'nudge'
    direction = 'direction'
    answer = 'answer'


class Hints(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    frequency: Frequency
    depth: Depth


class Knobs(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    attempts: int | None = Field(None, ge=1)
    decoys: int | None = Field(None, ge=0)
    otpWindow: int | None = Field(None, ge=1)


class Effect(
    RootModel[
        EffectRevealNodes
        | EffectGrantClues
        | EffectOpenSegment
        | EffectSetFlag
        | EffectAddTrack
        | EffectUnlockCodex
        | EffectFlipperSay
        | EffectCompleteObjective
    ]
):
    root: (
        EffectRevealNodes
        | EffectGrantClues
        | EffectOpenSegment
        | EffectSetFlag
        | EffectAddTrack
        | EffectUnlockCodex
        | EffectFlipperSay
        | EffectCompleteObjective
    ) = Field(..., description='One simple operation. Each object holds exactly one key.', title='Effect')


class Effects(RootModel[list[Effect]]):
    root: list[Effect]


class PuzzleKnobs(RootModel[dict[Archetype, Knobs]]):
    root: dict[Archetype, Knobs] = Field(
        ..., description='Per-archetype knobs: attempts, decoys, OTP window. Keys are archetype ids.'
    )


class Difficulty(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    noiseMultiplier: float = Field(..., ge=0.0)
    alarmDecayPerTick: float = Field(..., ge=0.0)
    wrongGuessNoise: int = Field(..., ge=0, le=100)
    hints: Hints
    flipperPreWarn: bool
    puzzleKnobs: PuzzleKnobs


class DifficultyOverride(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    noiseMultiplier: float | None = Field(None, ge=0.0)
    alarmDecayPerTick: float | None = Field(None, ge=0.0)
    wrongGuessNoise: int | None = Field(None, ge=0, le=100)
    flipperPreWarn: bool | None = None
    puzzleKnobs: PuzzleKnobs | None = None


class ConditionAll(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    all: list[Condition] = Field(..., min_length=1)


class ConditionAny(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    any: list[Condition] = Field(..., min_length=1)


class ConditionNot(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    not_: Condition = Field(..., alias='not')


class Condition(
    RootModel[
        ConditionAll
        | ConditionAny
        | ConditionNot
        | ConditionNodeState
        | ConditionHasClue
        | ConditionHasKey
        | ConditionSegmentOpen
        | ConditionFlag
        | ConditionNpcFactRevealed
        | ConditionTrackBelow
        | ConditionTrackAbove
        | ConditionLockFilled
        | ConditionTickAtLeast
    ]
):
    root: (
        ConditionAll
        | ConditionAny
        | ConditionNot
        | ConditionNodeState
        | ConditionHasClue
        | ConditionHasKey
        | ConditionSegmentOpen
        | ConditionFlag
        | ConditionNpcFactRevealed
        | ConditionTrackBelow
        | ConditionTrackAbove
        | ConditionLockFilled
        | ConditionTickAtLeast
    ) = Field(..., description='Condition tree: all / any / not over a closed set of atoms. Each object holds exactly one key.', title='Condition')


ConditionAll.model_rebuild()
ConditionAny.model_rebuild()
ConditionNot.model_rebuild()
