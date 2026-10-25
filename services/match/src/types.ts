// Duel domain types. Both sides play on the same node graph and both solve
// puzzles: Red runs the campaign engine to attack; Blue solves the same puzzle
// archetype as a defence, which hardens (secures) the node against that attack.
import type { Command, GameEvent, GameState, PuzzleInstance } from '@zero-day/engine';

export type Role = 'red' | 'blue';

export interface Vec2 {
  x: number;
  y: number;
}

export interface DuelMap {
  caseId: string;
  pos: Record<string, Vec2>;
  adj: Record<string, string[]>;
  entry: string;
  target: string;
}

export interface DuelState {
  map: DuelMap;
  red: GameState; // attacker engine state
  bluePuzzle: PuzzleInstance | null; // Blue's active defence puzzle
  bluePuzzleNode: string | null;
  blueRng: number;
  securedUntil: Record<string, number>; // nodeId -> timestamp the hardening lasts to
  detection: number; // mirror of engine alarm (0..100); 100 => Red caught => Blue wins
  phase: 'playing' | 'over';
  winner: Role | null;
  reason: string | null;
  startedAt: number;
  deadline: number;
}

// ---- WebSocket protocol ----

export type ClientMsg =
  | { t: 'join'; room: string; role: Role; nick?: string }
  | { t: 'red_cmd'; cmd: Command } // engine Command: ScanNode / ProposeHypothesis / SubmitPuzzle / CancelPuzzle
  | { t: 'blue_patch'; node: string; vuln: string } // open a defence puzzle on a node
  | { t: 'blue_submit'; answer: string[] }
  | { t: 'blue_cancel' };

export type ServerMsg =
  | { t: 'joined'; role: Role; caseId: string; opponentKind: 'human' | 'ai' | null }
  | { t: 'tick'; view: RedView | BlueView }
  | { t: 'events'; events: GameEvent[] }
  | { t: 'over'; winner: Role; reason: string }
  | { t: 'error'; msg: string };

export interface RedView {
  role: 'red';
  red: GameState; // carries activePuzzle for the shared PuzzlePanel
  secured: string[]; // nodes Red cannot attack right now (Blue hardened them)
  detection: number;
}

export interface BlueView {
  role: 'blue';
  puzzle: PuzzleInstance | null; // Blue's defence puzzle for the PuzzlePanel
  puzzleNode: string | null;
  compromised: string[]; // nodes Red has taken
  underAttack: string | null; // node Red is solving a puzzle on
  secured: string[];
  detection: number;
}
