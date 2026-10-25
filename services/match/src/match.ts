// Authoritative duel: one shared DuelState, real-time tick loop. Red drives the
// campaign engine; Blue is an arcade patrol that eats Red's footprints to raise
// detection and can interrupt an active exploit by reaching its node.
import { apply, createGame, startCase } from '@zero-day/engine';
import type { Case, Command, GameEvent } from '@zero-day/engine';
import { content } from './content.ts';
import type { BlueView, DuelMap, DuelState, RedView, Role, Vec2 } from './types.ts';

// Duel balance. Final numbers belong in content/duel/rules.json.
const RULES = {
  roundMs: 6 * 60_000,
  patrolSpeed: 22, // map units per second
  arriveEps: 2.5, // distance at which the patrol "arrives" at a node
  detectionDecayPerSec: 1.2, // Red staying quiet cools the bar
  isolateMs: 8_000, // a node stays isolated this long
  isolateCooldownMs: 24_000, // one isolate per this window
  layLowBurn: 18, // footprints removed near the target per lay_low
  footprintWeight: { ScanOpened: 3, NodeScanned: 4, PuzzleOpened: 2, ExploitSucceeded: 9, NodeCompromised: 6 } as Record<string, number>,
};

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function buildMap(caseId: string): DuelMap {
  const c = content.cases[caseId] as Case | undefined;
  if (!c) throw new Error(`unknown case ${caseId}`);
  const pos: Record<string, Vec2> = {};
  const adj: Record<string, string[]> = {};
  for (const n of c.nodes) {
    pos[n.id] = { x: n.position.x, y: n.position.y };
    adj[n.id] = [];
  }
  for (const e of c.edges ?? []) {
    adj[e.from]?.push(e.to);
    adj[e.to]?.push(e.from);
  }
  const entry = c.nodes.find((n) => n.kind !== 'target')?.id ?? c.nodes[0]!.id;
  const target = c.nodes.find((n) => n.kind === 'target')?.id ?? c.nodes.at(-1)!.id;
  return { caseId, pos, adj, entry, target };
}

function difficultyFor(caseId: string) {
  const lvl = content.campaign.levels.find((l) => l.cases?.some((cc) => cc === caseId || cc?.id === caseId));
  return (lvl ?? content.campaign.levels[0]).difficulty;
}

export function createDuel(caseId = 'L3C1', seed = Date.now() & 0xffff): DuelState {
  const map = buildMap(caseId);
  const red = startCase(content, createGame(content, caseId, difficultyFor(caseId), seed));
  const now = Date.now();
  return {
    map,
    red,
    blue: { at: { ...map.pos[map.entry]! }, from: map.entry, to: map.entry, speed: RULES.patrolSpeed, isolateCooldown: 0 },
    footprints: {},
    detection: 0,
    isolatedUntil: {},
    phase: 'playing',
    winner: null,
    reason: null,
    startedAt: now,
    deadline: now + RULES.roundMs,
  };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/** Red action. Returns the engine events (for the Red client) or a rejection. */
export function redCommand(d: DuelState, cmd: Command): GameEvent[] {
  if (d.phase !== 'playing') return [];
  const node = 'node' in cmd ? (cmd.node as string) : null;
  if (node && (d.isolatedUntil[node] ?? 0) > Date.now())
    return [{ type: 'CommandRejected', reason: 'node-dim' }];
  const { state, events } = apply(content, d.red, cmd);
  d.red = state;
  for (const ev of events) {
    const n = 'node' in ev ? (ev.node as string) : null;
    const w = RULES.footprintWeight[ev.type];
    if (n && w) d.footprints[n] = (d.footprints[n] ?? 0) + w;
  }
  return events;
}

export function redLayLow(d: DuelState): void {
  if (d.phase !== 'playing') return;
  const t = d.map.target;
  for (const n of [t, ...(d.map.adj[t] ?? [])]) {
    if (d.footprints[n]) d.footprints[n] = Math.max(0, d.footprints[n] - RULES.layLowBurn);
  }
}

/** Blue heads toward an adjacent node. */
export function blueMove(d: DuelState, node: string): void {
  if (d.phase !== 'playing') return;
  if (!(d.map.adj[d.blue.to] ?? []).includes(node)) return; // only to a neighbour
  d.blue.from = d.blue.to;
  d.blue.to = node;
}

export function blueIsolate(d: DuelState, node: string): void {
  if (d.phase !== 'playing' || d.blue.isolateCooldown > 0) return;
  if (!d.map.pos[node]) return;
  d.isolatedUntil[node] = Date.now() + RULES.isolateMs;
  d.blue.isolateCooldown = RULES.isolateCooldownMs;
}

/** Advance the world by dtMs. Returns true when the match just ended. */
export function tick(d: DuelState, dtMs: number): boolean {
  if (d.phase !== 'playing') return false;
  const dt = dtMs / 1000;

  // Blue patrol moves toward its target node.
  const dest = d.map.pos[d.blue.to]!;
  const gap = dist(d.blue.at, dest);
  if (gap > RULES.arriveEps) {
    const step = Math.min(gap, d.blue.speed * dt);
    d.blue.at.x += ((dest.x - d.blue.at.x) / gap) * step;
    d.blue.at.y += ((dest.y - d.blue.at.y) / gap) * step;
  } else {
    d.blue.at = { ...dest };
    // Arrived: eat footprints -> detection; interrupt an active exploit here.
    const eaten = d.footprints[d.blue.to] ?? 0;
    if (eaten > 0) {
      d.detection = clamp(d.detection + eaten);
      d.footprints[d.blue.to] = 0;
    }
    if (d.red.activePuzzle?.nodeId === d.blue.to) {
      d.red = apply(content, d.red, { type: 'CancelPuzzle' }).state;
      d.detection = clamp(d.detection + 6);
    }
  }

  d.detection = clamp(d.detection - RULES.detectionDecayPerSec * dt);
  d.blue.isolateCooldown = Math.max(0, d.blue.isolateCooldown - dtMs);

  // Win checks.
  if (d.red.nodes[d.map.target]?.compromised) return end(d, 'red', 'target-reached');
  if (d.detection >= 100) return end(d, 'blue', 'detected');
  if (Date.now() >= d.deadline) return end(d, 'blue', 'timeout');
  return false;
}

function end(d: DuelState, winner: Role, reason: string): boolean {
  d.phase = 'over';
  d.winner = winner;
  d.reason = reason;
  return true;
}

// ---- Role projections (fog of war) ----

export function project(d: DuelState, role: Role): RedView | BlueView {
  if (role === 'red') {
    // Red learns Blue's position only once the patrol sits on a node Red revealed.
    const onNode = d.blue.to;
    const revealed = d.red.nodes[onNode]?.revealed && dist(d.blue.at, d.map.pos[onNode]!) <= RULES.arriveEps;
    return { role: 'red', red: d.red, detection: d.detection, bluePresence: revealed ? onNode : null };
  }
  const now = Date.now();
  return {
    role: 'blue',
    blue: d.blue,
    footprints: d.footprints,
    detection: d.detection,
    activeExploit: d.red.activePuzzle?.nodeId ?? null,
    isolated: Object.keys(d.isolatedUntil).filter((n) => d.isolatedUntil[n]! > now),
  };
}
