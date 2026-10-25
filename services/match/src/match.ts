// Authoritative duel. Both sides act on the same node graph. Red drives the
// campaign engine (scan + attack puzzles) to compromise the target. Blue hardens
// nodes by solving the same puzzle archetype as a defence: a secured node blocks
// Red's attack there for a while. Red wins by taking the target; Blue wins by
// running the clock out or getting Red caught (alarm 100).
import { apply, createGame, generatePuzzle, startCase, verifyPuzzle } from '@zero-day/engine';
import type { Case, Command, GameEvent, PuzzleInstance } from '@zero-day/engine';
import { content } from './content.ts';
import type { BlueView, DuelMap, DuelState, RedView, Role } from './types.ts';

const RULES = {
  roundMs: 6 * 60_000,
  secureMs: 22_000, // how long a Blue patch holds before it lapses
};

function buildMap(caseId: string): DuelMap {
  const c = content.cases[caseId] as Case | undefined;
  if (!c) throw new Error(`unknown case ${caseId}`);
  const pos: Record<string, { x: number; y: number }> = {};
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
    bluePuzzle: null,
    bluePuzzleNode: null,
    blueRng: (seed * 2654435761) >>> 0,
    securedUntil: {},
    detection: 0,
    phase: 'playing',
    winner: null,
    reason: null,
    startedAt: now,
    deadline: now + RULES.roundMs,
  };
}

function isSecured(d: DuelState, node: string): boolean {
  return (d.securedUntil[node] ?? 0) > Date.now();
}

// ---- Red ----

export function redCommand(d: DuelState, cmd: Command): GameEvent[] {
  if (d.phase !== 'playing') return [];
  // A hardened node repels a fresh attack attempt.
  if (cmd.type === 'ProposeHypothesis' && isSecured(d, cmd.node))
    return [{ type: 'CommandRejected', reason: 'not-exploitable' }];
  const { state, events } = apply(content, d.red, cmd);
  d.red = state;
  d.detection = Math.max(0, Math.min(100, d.red.tracks.alarm ?? 0));
  return events;
}

// ---- Blue ----

export function bluePatch(d: DuelState, node: string, vuln: string): void {
  if (d.phase !== 'playing' || d.bluePuzzle) return;
  const c = content.cases[d.map.caseId] as Case;
  const n = c.nodes.find((x) => x.id === node);
  const ex = n?.exploits.find((e) => e.vuln === vuln);
  if (!n || !ex) return;
  const arch = content.puzzles[vuln]?.archetype ?? 'default';
  const title = content.puzzles[vuln]?.title ?? vuln;
  const knobs = { ...d.red.difficulty.puzzleKnobs[arch], ...ex.knobs };
  const [rng, inst] = generatePuzzle(d.blueRng, arch, title, ex.puzzleParams ?? {}, knobs, node, vuln, {
    genuine: true,
    label: (id: string) => c.nodes.find((x) => x.id === id)?.label ?? id,
  });
  d.blueRng = rng;
  d.bluePuzzle = inst;
  d.bluePuzzleNode = node;
}

/** Returns true when the patch landed (node hardened). */
export function blueSubmit(d: DuelState, answer: string[]): boolean {
  if (d.phase !== 'playing' || !d.bluePuzzle || !d.bluePuzzleNode) return false;
  if (verifyPuzzle(d.bluePuzzle, answer)) {
    d.securedUntil[d.bluePuzzleNode] = Date.now() + RULES.secureMs;
    d.bluePuzzle = null;
    d.bluePuzzleNode = null;
    return true;
  }
  const left = (d.bluePuzzle.attemptsLeft ?? 1) - 1;
  if (left <= 0) {
    d.bluePuzzle = null;
    d.bluePuzzleNode = null;
  } else {
    d.bluePuzzle = { ...d.bluePuzzle, attemptsLeft: left } as PuzzleInstance;
  }
  return false;
}

export function blueCancel(d: DuelState): void {
  d.bluePuzzle = null;
  d.bluePuzzleNode = null;
}

// ---- Clock & win ----

export function tick(d: DuelState): boolean {
  if (d.phase !== 'playing') return false;
  if (d.red.nodes[d.map.target]?.compromised) return end(d, 'red', 'target-reached');
  if (d.red.phase === 'caught' || d.detection >= 100) return end(d, 'blue', 'caught');
  if (Date.now() >= d.deadline) return end(d, 'blue', 'held-the-line');
  return false;
}

function end(d: DuelState, winner: Role, reason: string): boolean {
  d.phase = 'over';
  d.winner = winner;
  d.reason = reason;
  return true;
}

// ---- Projections (fog of war) ----

function securedList(d: DuelState): string[] {
  const now = Date.now();
  return Object.keys(d.securedUntil).filter((n) => d.securedUntil[n]! > now);
}

export function project(d: DuelState, role: Role): RedView | BlueView {
  if (role === 'red') return { role: 'red', red: d.red, secured: securedList(d), detection: d.detection };
  const compromised = Object.keys(d.red.nodes).filter((id) => d.red.nodes[id]?.compromised);
  return {
    role: 'blue',
    puzzle: d.bluePuzzle,
    puzzleNode: d.bluePuzzleNode,
    compromised,
    underAttack: d.red.activePuzzle?.nodeId ?? null,
    secured: securedList(d),
    detection: d.detection,
  };
}
