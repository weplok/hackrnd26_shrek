/* Generated from content/schemas by `pnpm codegen`. Do not edit. */

/**
 * Condition tree: all / any / not over a closed set of atoms. Each object holds exactly one key.
 */
export type Condition =
  | ConditionAll
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
  | ConditionTickAtLeast;
/**
 * One simple operation. Each object holds exactly one key.
 */
export type Effect =
  | EffectRevealNodes
  | EffectGrantClues
  | EffectOpenSegment
  | EffectSetFlag
  | EffectAddTrack
  | EffectUnlockCodex
  | EffectFlipperSay
  | EffectCompleteObjective;
/**
 * @minItems 1
 */
export type IdList = string[];
export type Effects = Effect[];

export interface Content {
  campaign?: Campaign;
  case?: Case;
  "codex-card"?: CodexCard;
  consequences?: Consequences;
  flipper?: Flipper;
  interludes?: Interludes;
  npc?: Npc;
  puzzles?: Puzzles;
  vulnerabilities?: Vulnerabilities;
}
/**
 * content/campaign.json: levels, case order, interludes, difficulty.
 */
export interface Campaign {
  schemaVersion: 1;
  contentVersion: string;
  /**
   * @minItems 1
   */
  levels: Level[];
  interludes: {
    afterCase: string;
    interlude: string;
  }[];
}
export interface Level {
  id: string;
  title: string;
  accent: string;
  difficulty: Difficulty;
  /**
   * @minItems 1
   */
  cases: string[];
}
export interface Difficulty {
  noiseMultiplier: number;
  alarmDecayPerTick: number;
  wrongGuessNoise: number;
  hints: {
    frequency: "low" | "medium" | "high";
    depth: "nudge" | "direction" | "answer";
  };
  flipperPreWarn: boolean;
  puzzleKnobs: PuzzleKnobs;
}
/**
 * Per-archetype knobs: attempts, decoys, OTP window. Keys are archetype ids.
 */
export interface PuzzleKnobs {
  [k: string]: Knobs;
}
export interface Knobs {
  attempts?: number;
  decoys?: number;
  otpWindow?: number;
}
/**
 * One case of the campaign: content/cases/<id>.json.
 */
export interface Case {
  schemaVersion: 1;
  id: string;
  title: string;
  brief: Brief;
  scope: Scope;
  difficulty?: DifficultyOverride;
  /**
   * @minItems 1
   */
  segments: Segment[];
  /**
   * @minItems 1
   */
  nodes: Node[];
  edges: Edge[];
  clues: Clue[];
  keyRecipes: KeyRecipe[];
  npcs: string[];
  /**
   * @minItems 1
   */
  objectives: Objective[];
  /**
   * @minItems 1
   */
  tracks: TrackConfig[];
  /**
   * Items: Case systems; the engine runs them in a fixed order.
   */
  systems: ("tracks" | "hunter" | "npcCooldown" | "objectives" | "flipper" | "caughtCheck")[];
  report: Report;
  /**
   * @minItems 1
   */
  ranks: Rank[];
  checkpoints: Checkpoint[];
}
export interface Brief {
  client: string;
  text: string;
  illustration?: string;
}
export interface Scope {
  text: string;
  rules?: string[];
  /**
   * Consequence shown when the player confirms an out-of-scope action.
   */
  consequence?: string;
}
/**
 * Partial Difficulty merged over the level difficulty.
 */
export interface DifficultyOverride {
  noiseMultiplier?: number;
  alarmDecayPerTick?: number;
  wrongGuessNoise?: number;
  flipperPreWarn?: boolean;
  puzzleKnobs?: PuzzleKnobs;
}
export interface Segment {
  id: string;
  label: string;
  openAtStart: boolean;
}
export interface Node {
  id: string;
  kind: "machine" | "person" | "object" | "target" | "decoy";
  label: string;
  segment: string;
  position: Position;
  inScope: boolean;
  revealedBy?: Condition;
  scanNoise: number;
  /**
   * NPC behind a person node.
   */
  npc?: string;
  exploits: Exploit[];
  /**
   * Hint per wrong vulnerability guess, keyed by SL-xx.
   */
  failHints: {
    [k: string]: string;
  };
  lock?: Lock;
  onCompromise: Effects;
}
export interface Position {
  x: number;
  y: number;
}
export interface ConditionAll {
  /**
   * @minItems 1
   */
  all: Condition[];
}
export interface ConditionAny {
  /**
   * @minItems 1
   */
  any: Condition[];
}
export interface ConditionNot {
  not: Condition;
}
export interface ConditionNodeState {
  nodeState: {
    node: string;
    state:
      | "hidden"
      | "dim"
      | "visible"
      | "untouched"
      | "compromised"
      | "secured"
      | "calm"
      | "alerted"
      | "detected"
      | "scanned";
  };
}
export interface ConditionHasClue {
  hasClue: string;
}
export interface ConditionHasKey {
  hasKey: string;
}
export interface ConditionSegmentOpen {
  segmentOpen: string;
}
export interface ConditionFlag {
  flag: string;
}
export interface ConditionNpcFactRevealed {
  npcFactRevealed: {
    npc: string;
    fact: string;
  };
}
export interface ConditionTrackBelow {
  trackBelow: Threshold;
}
export interface Threshold {
  track: "alarm" | "logs" | "antifraud" | "attention";
  value: number;
}
export interface ConditionTrackAbove {
  trackAbove: Threshold;
}
export interface ConditionLockFilled {
  lockFilled: string;
}
export interface ConditionTickAtLeast {
  tickAtLeast: number;
}
export interface Exploit {
  vuln: string;
  requires?: Condition;
  /**
   * Archetype-specific generator data; the puzzle plugin validates it.
   */
  puzzleParams: {};
  knobs?: Knobs;
  effects?: Effects;
}
export interface EffectRevealNodes {
  revealNodes: IdList;
}
export interface EffectGrantClues {
  grantClues: IdList;
}
export interface EffectOpenSegment {
  openSegment: string;
}
export interface EffectSetFlag {
  setFlag: string;
}
export interface EffectAddTrack {
  addTrack: {
    track: "alarm" | "logs" | "antifraud" | "attention";
    delta: number;
  };
}
export interface EffectUnlockCodex {
  unlockCodex: string;
}
export interface EffectFlipperSay {
  flipperSay: string;
}
export interface EffectCompleteObjective {
  completeObjective: string;
}
export interface Lock {
  /**
   * @minItems 1
   */
  sockets: Socket[];
}
export interface Socket {
  id: string;
  /**
   * Key reference in a lock socket, for example key:domain_admin.
   */
  accepts: string;
  label: string;
}
export interface Edge {
  from: string;
  to: string;
  revealedBy?: Condition;
}
export interface Clue {
  id: string;
  type: "password-fragment" | "file" | "name" | "phrase" | "config" | "token" | "physkey" | "legend";
  text: string;
  foundOn: string;
}
export interface KeyRecipe {
  /**
   * @minItems 2
   */
  inputs: string[];
  output: string;
  label: string;
}
export interface Objective {
  id: string;
  title: string;
  doneWhen: Condition;
  parent?: string;
  checkpoint?: boolean;
}
export interface TrackConfig {
  id: "alarm" | "logs" | "antifraud" | "attention";
  label: string;
  start: number;
}
export interface Report {
  /**
   * @minItems 1
   */
  findings: Finding[];
}
export interface Finding {
  id: string;
  vuln: string;
  node: string;
  /**
   * @minItems 2
   */
  options: RemediationOption[];
  explanation: string;
}
export interface RemediationOption {
  id: string;
  text: string;
  correct: boolean;
}
/**
 * Ranks are checked in order; the first matching one wins. A rank without when is the fallback.
 */
export interface Rank {
  id: string;
  title: string;
  when?: Condition;
}
/**
 * Start of a case step; restore point after caught.
 */
export interface Checkpoint {
  id: string;
  label: string;
  when: Condition;
}
/**
 * content/catalog/codex/SL-xx.json: one Codex card.
 */
export interface CodexCard {
  schemaVersion: 1;
  id: string;
  realTerm: string;
  whyItWorks: string;
  defense: string;
  realCase: string;
  law: string;
  /**
   * Legal training resources only.
   */
  learnMore: {
    title: string;
    url: string;
  }[];
}
/**
 * content/consequences.json: consequence maps for out-of-scope actions.
 */
export interface Consequences {
  schemaVersion: 1;
  /**
   * @minItems 1
   */
  items: Consequence[];
}
export interface Consequence {
  id: string;
  title: string;
  /**
   * @minItems 1
   */
  facts: string[];
  reputationDelta: number;
}
/**
 * content/flipper.json: Flipper lines by trigger.
 */
export interface Flipper {
  schemaVersion: 1;
  /**
   * @minItems 1
   */
  lines: FlipperLine[];
}
export interface FlipperLine {
  id: string;
  trigger: {
    event:
      | "CaseStarted"
      | "NodeScanned"
      | "NodesRevealed"
      | "CluesFound"
      | "TrackChanged"
      | "PuzzleOpened"
      | "ScopeWarning"
      | "PuzzleCancelled"
      | "PuzzleSolved"
      | "PuzzleFailed"
      | "ExploitSucceeded"
      | "ExploitMismatched"
      | "KeyAssembled"
      | "CombineFailed"
      | "SocketFilled"
      | "LockOpened"
      | "NpcReplied"
      | "NpcFactRevealed"
      | "NpcSuspicionChanged"
      | "NpcLocked"
      | "ScopeViolated"
      | "ConsequenceShown"
      | "TimePassed"
      | "RemediationChosen"
      | "NodeSecured"
      | "CaseCompleted"
      | "CheckpointRestored"
      | "CommandRejected"
      | "Ticked"
      | "ObjectiveCompleted"
      | "HunterMoved"
      | "FlipperMoodChanged"
      | "FlipperSaid"
      | "Caught";
    when?: Condition;
  };
  /**
   * @minItems 1
   */
  text: string[];
  cooldownTicks: number;
  minLevel?: number;
  maxLevel?: number;
}
/**
 * content/interludes.json.
 */
export interface Interludes {
  schemaVersion: 1;
  items: Interlude[];
}
export interface Interlude {
  id: string;
  title: string;
  /**
   * @minItems 1
   */
  slides: {
    text: string;
    illustration?: string;
  }[];
  effects?: Effects;
}
/**
 * content/npc/<id>.json: persona, suspicion, facts and the scripted rule table.
 */
export interface Npc {
  schemaVersion: 1;
  id: string;
  name: string;
  persona: {
    role: string;
    character: string;
    speechStyle: string;
  };
  suspicion: {
    start: number;
    lockAt: number;
    cooldownTicks?: number;
  };
  greeting: string;
  facts: Fact[];
  /**
   * @minItems 1
   */
  rules: Rule[];
  /**
   * @minItems 1
   */
  scriptedLines: Line[];
  llm?: {
    systemPromptRef: string;
    allowedFactIds: string[];
  };
}
export interface Fact {
  id: string;
  text: string;
  grantsClue?: string;
}
/**
 * Rules are checked in order; the first matching rule fires.
 */
export interface Rule {
  id: string;
  intent?: string;
  /**
   * @minItems 1
   */
  tones?: ("friendly" | "business" | "urgent" | "flattery" | "pushy")[];
  /**
   * Clue or key ids the player must attach to the line.
   */
  presented?: string[];
  /**
   * Clue or key ids that must not be attached.
   */
  missing?: string[];
  when?: Condition;
  suspicion: number;
  reply: string;
  revealFacts?: string[];
  effects?: Effects;
}
export interface Line {
  id: string;
  text: string;
}
/**
 * content/catalog/puzzles.json: puzzle archetype registry.
 */
export interface Puzzles {
  schemaVersion: 1;
  /**
   * @minItems 1
   */
  items: Puzzle[];
}
export interface Puzzle {
  archetype:
    | "sticker"
    | "password-wheel"
    | "open-door"
    | "expired-patch"
    | "legend-mosaic"
    | "trust-path"
    | "forgotten-key"
    | "wall"
    | "tired-guard"
    | "open-port"
    | "chatty-logs"
    | "code-intercept"
    | "blind-spot";
  vuln: string;
  title: string;
}
/**
 * content/catalog/vulnerabilities.json: the SL catalog.
 */
export interface Vulnerabilities {
  schemaVersion: 1;
  /**
   * @minItems 1
   */
  items: Vulnerability[];
}
export interface Vulnerability {
  id: string;
  title: string;
  archetype:
    | "sticker"
    | "password-wheel"
    | "open-door"
    | "expired-patch"
    | "legend-mosaic"
    | "trust-path"
    | "forgotten-key"
    | "wall"
    | "tired-guard"
    | "open-port"
    | "chatty-logs"
    | "code-intercept"
    | "blind-spot";
  noiseProfile: "quiet" | "moderate" | "loud";
  killChainStage:
    | "recon"
    | "initial_access"
    | "credential_access"
    | "lateral_movement"
    | "privilege_escalation"
    | "defense_evasion"
    | "collection";
  codexCardId: string;
  introducedInLevel: number;
}
