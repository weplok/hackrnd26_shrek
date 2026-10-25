// Duel domain types: authoritative real-time Red-vs-Blue match state and the
// WebSocket protocol. Red reuses the campaign engine as-is; Blue is an arcade
// patrol overlaid on the same node graph.
import type { Command, GameEvent, GameState } from '@zero-day/engine';

export type Role = 'red' | 'blue';

export interface Vec2 {
  x: number;
  y: number;
}

/** Static graph pulled from the case content: node positions + adjacency. */
export interface DuelMap {
  caseId: string;
  pos: Record<string, Vec2>; // nodeId -> map coords (0..100)
  adj: Record<string, string[]>; // nodeId -> neighbour nodeIds
  entry: string;
  target: string;
}

/** Blue's arcade avatar — a Pac-Man-style patrol moving across the graph. */
export interface BluePatrol {
  at: Vec2; // current sprite position
  from: string; // node last left
  to: string; // node heading toward
  speed: number; // units per second
  isolateCooldown: number; // ms until isolate ability ready again
}

/** Footprints Red drops on nodes; Blue eats them to raise detection. */
export type Footprints = Record<string, number>; // nodeId -> remaining amount

export interface DuelState {
  map: DuelMap;
  red: GameState; // engine state = Red's hacking progress
  blue: BluePatrol;
  footprints: Footprints;
  detection: number; // 0..100; 100 => Blue wins (Red caught)
  isolatedUntil: Record<string, number>; // nodeId -> timestamp until isolation lifts
  phase: 'playing' | 'over';
  winner: Role | null;
  reason: string | null;
  startedAt: number;
  deadline: number; // round time limit
}

// ---- WebSocket protocol (real-time) ----

export type ClientMsg =
  | { t: 'join'; room: string; role: Role; nick?: string }
  | { t: 'red_cmd'; cmd: Command } // Red hacking action (engine Command)
  | { t: 'red_lay_low' } // Red lies low: burns down footprints near the target
  | { t: 'blue_move'; node: string } // Blue picks an adjacent node to head to
  | { t: 'blue_isolate'; node: string }; // Blue power-pellet: isolate a node

export type ServerMsg =
  | { t: 'joined'; role: Role; caseId: string; opponentKind: 'human' | 'ai' | null }
  | { t: 'tick'; view: RedView | BlueView }
  | { t: 'events'; events: GameEvent[] }
  | { t: 'over'; winner: Role; reason: string }
  | { t: 'error'; msg: string };

/** Red sees its own engine projection + the detection bar (fog of war). */
export interface RedView {
  role: 'red';
  red: GameState;
  detection: number;
  bluePresence: string | null; // node where Blue patrol currently is, if revealed
}

/** Blue sees the whole map, footprints and where Red is actively exploiting. */
export interface BlueView {
  role: 'blue';
  blue: BluePatrol;
  footprints: Footprints;
  detection: number;
  activeExploit: string | null; // node Red is solving a puzzle on, if any
  isolated: string[];
}
