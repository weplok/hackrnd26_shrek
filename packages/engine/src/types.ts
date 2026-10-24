// ZERO DAY engine — runtime types. Framework-agnostic.
import type {
  Case,
  Node as ContentNode,
  Exploit,
  Condition,
  Effect,
  Difficulty,
  CodexCard,
  Vulnerability,
  Consequence,
  Campaign,
  Interludes,
  Flipper,
} from './content/types.gen.ts';

export type {
  Case,
  ContentNode,
  Exploit,
  Condition,
  Effect,
  Difficulty,
  CodexCard,
  Vulnerability,
  Consequence,
  Campaign,
  Interludes,
  Flipper,
};

/** Scripted NPC config (content/npc/<id>.json). No JSON-schema; shape per ИИ-диалоги diz-doc. */
export interface NpcRule {
  if: {
    tone?: string;
    has_clue?: string;
    has_key?: string;
    missing_clue?: string;
    missing_key?: string;
  };
  then: {
    suspicion: number;
    reply: string;
    grant?: string[];
    flipper?: string;
  };
}
export interface NpcConfig {
  npc: string;
  role: string;
  archetype: string;
  holds: string[];
  suspicion: { start: number; fail_at: number };
  requires?: { legend?: string[]; clues?: string[] };
  tones: string[];
  replies: Record<string, string>;
  rules: NpcRule[];
  codex?: string;
}

/** Everything the engine needs, indexed. Built by the host (web) or the test harness. */
export interface Content {
  campaign: Campaign;
  cases: Record<string, Case>;
  codex: Record<string, CodexCard>;
  vulnerabilities: Record<string, Vulnerability>;
  puzzles: Record<string, { archetype: string; title: string }>; // keyed by SL id
  npcs: Record<string, NpcConfig>;
  consequences: Record<string, Consequence>;
  flipper: Flipper;
  interludes: Interludes;
}

export type TrackId = 'alarm' | 'logs' | 'antifraud' | 'attention';

export interface NodeRuntime {
  revealed: boolean;
  scanned: boolean;
  compromised: boolean;
  secured: boolean;
}

export interface NpcRuntime {
  suspicion: number;
  locked: boolean;
  yielded: boolean;
}

export type Phase = 'briefing' | 'playing' | 'report' | 'won' | 'caught';

export interface PuzzleInstance {
  nodeId: string;
  vuln: string;
  archetype: string;
  title: string;
  prompt: string;
  options: { id: string; label: string }[];
  multi: boolean; // select multiple (legend-mosaic)
  correct: string[]; // option ids that are correct
}

export interface LogEntry {
  t: string;
  kind: string;
}

/** State saved at the start of a case step (Q-7); restored after caught. */
export interface CheckpointSnapshot {
  id: string;
  state: GameState; // stored with checkpoint: null
}

export interface GameState {
  caseId: string;
  phase: Phase;
  tick: number;
  scans: number;
  socialActions: number;
  techActions: number;
  nodes: Record<string, NodeRuntime>;
  segmentsOpen: Record<string, boolean>;
  clues: Record<string, boolean>;
  keys: Record<string, boolean>;
  flags: Record<string, boolean>;
  tracks: Record<string, number>;
  maxAlarm: number;
  noise: Record<string, number>; // alarm added per source since last checkpoint, for the caught debrief
  checkpointsReached: Record<string, boolean>;
  checkpoint: CheckpointSnapshot | null;
  codex: Record<string, boolean>;
  npc: Record<string, NpcRuntime>;
  sockets: Record<string, Record<string, boolean>>; // nodeId -> socketId -> filled
  objectives: Record<string, boolean>;
  report: Record<string, boolean>; // findingId -> answeredCorrectly
  rng: number; // mutable RNG state
  activePuzzle: PuzzleInstance | null;
  activeChat: string | null;
  pendingScope: string | null; // node id awaiting out-of-scope confirm
  rank: string | null;
  log: LogEntry[];
  difficulty: Difficulty;
}
