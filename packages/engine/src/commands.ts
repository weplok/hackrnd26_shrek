// Command pipeline (TZ 7.2–7.3): validate → handler → events derived from the state diff.
import type { Content, GameState } from './types.ts';
import { scan, hypothesize, submitPuzzle, cancelPuzzle, restoreCheckpoint, DEFAULT_FAIL_HINT } from './engine.ts';
import { verifyPuzzle } from './puzzles.ts';

export type Command =
  | { type: 'ScanNode'; node: string }
  | { type: 'ProposeHypothesis'; node: string; vuln: string }
  | { type: 'SubmitPuzzle'; answer: string[] }
  | { type: 'CancelPuzzle' }
  | { type: 'RestoreCheckpoint' };

export type RejectReason =
  | 'not-playing'
  | 'unknown-node'
  | 'node-hidden'
  | 'puzzle-active'
  | 'no-puzzle'
  | 'not-scanned'
  | 'not-exploitable'
  | 'not-caught';

export type GameEvent =
  | { type: 'CommandRejected'; reason: RejectReason }
  | { type: 'NodeScanned'; node: string; repeat: boolean }
  | { type: 'NodesRevealed'; nodes: string[] }
  | { type: 'CluesFound'; clues: string[] }
  | { type: 'TrackChanged'; track: string; from: number; to: number }
  | { type: 'ScopeWarning'; node: string }
  | { type: 'PuzzleOpened'; node: string; vuln: string }
  | { type: 'PuzzleCancelled'; node: string }
  | { type: 'PuzzleSolved'; node: string }
  | { type: 'PuzzleFailed'; node: string }
  | { type: 'ExploitSucceeded'; node: string; vuln: string }
  | { type: 'ExploitMismatched'; node: string; vuln: string; failHint: string }
  | { type: 'NodeCompromised'; node: string }
  | { type: 'SegmentOpened'; segment: string }
  | { type: 'CodexUnlocked'; card: string }
  | { type: 'ObjectiveCompleted'; objective: string }
  | { type: 'Ticked'; tick: number }
  | { type: 'Caught' }
  | { type: 'CheckpointRestored'; checkpoint: string }
  | { type: 'TargetReached' };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}

export function validate(content: Content, s: GameState, cmd: Command): RejectReason | null {
  // TZ 7.1: in caught only RestoreCheckpoint is accepted.
  if (cmd.type === 'RestoreCheckpoint') return s.phase === 'caught' && s.checkpoint ? null : 'not-caught';
  if (s.phase !== 'playing') return 'not-playing';
  switch (cmd.type) {
    case 'ScanNode':
    case 'ProposeHypothesis': {
      const n = content.cases[s.caseId]?.nodes.find((x) => x.id === cmd.node);
      if (!n) return 'unknown-node';
      if (!s.nodes[cmd.node]?.revealed) return 'node-hidden';
      if (cmd.type === 'ScanNode') return null;
      if (s.activePuzzle) return 'puzzle-active';
      if (!n.inScope) return null;
      if (n.kind === 'person' || n.lock) return 'not-exploitable';
      if (!s.nodes[cmd.node]?.scanned) return 'not-scanned';
      return null;
    }
    case 'SubmitPuzzle':
    case 'CancelPuzzle':
      return s.activePuzzle ? null : 'no-puzzle';
  }
}

export function apply(content: Content, state: GameState, cmd: Command): StepResult {
  const reason = validate(content, state, cmd);
  if (reason) return { state, events: [{ type: 'CommandRejected', reason }] };
  const next = run(content, state, cmd);
  return { state: next, events: [...primaryEvents(content, state, next, cmd), ...diffEvents(state, next)] };
}

function run(content: Content, s: GameState, cmd: Command): GameState {
  switch (cmd.type) {
    case 'ScanNode':
      return scan(content, s, cmd.node);
    case 'ProposeHypothesis':
      return hypothesize(content, s, cmd.node, cmd.vuln);
    case 'SubmitPuzzle':
      return submitPuzzle(content, s, cmd.answer);
    case 'CancelPuzzle':
      return cancelPuzzle(content, s);
    case 'RestoreCheckpoint':
      return restoreCheckpoint(content, s);
  }
}

function primaryEvents(content: Content, prev: GameState, next: GameState, cmd: Command): GameEvent[] {
  if (next.pendingScope && !prev.pendingScope) return [{ type: 'ScopeWarning', node: next.pendingScope }];
  switch (cmd.type) {
    case 'ScanNode':
      return [{ type: 'NodeScanned', node: cmd.node, repeat: !!prev.nodes[cmd.node]?.scanned }];
    case 'ProposeHypothesis':
      return [{ type: 'PuzzleOpened', node: cmd.node, vuln: cmd.vuln }];
    case 'CancelPuzzle':
      return [{ type: 'PuzzleCancelled', node: prev.activePuzzle?.nodeId ?? '' }];
    case 'RestoreCheckpoint':
      return [{ type: 'CheckpointRestored', checkpoint: next.checkpoint?.id ?? '' }];
    case 'SubmitPuzzle': {
      const inst = prev.activePuzzle;
      if (!inst) return [];
      const node = inst.nodeId;
      if (!verifyPuzzle(inst, cmd.answer)) return [{ type: 'PuzzleFailed', node }];
      if (next.nodes[node]?.compromised && !prev.nodes[node]?.compromised)
        return [
          { type: 'PuzzleSolved', node },
          { type: 'ExploitSucceeded', node, vuln: inst.vuln },
        ];
      const n = content.cases[prev.caseId]?.nodes.find((x) => x.id === node);
      const failHint = n?.failHints[inst.vuln] ?? DEFAULT_FAIL_HINT;
      return [
        { type: 'PuzzleSolved', node },
        { type: 'ExploitMismatched', node, vuln: inst.vuln, failHint },
      ];
    }
  }
}

const added = (prev: Record<string, boolean>, next: Record<string, boolean>) =>
  Object.keys(next).filter((k) => next[k] && !prev[k]);

function diffEvents(prev: GameState, next: GameState): GameEvent[] {
  const ev: GameEvent[] = [];
  const revealed = Object.keys(next.nodes).filter((id) => next.nodes[id]?.revealed && !prev.nodes[id]?.revealed);
  if (revealed.length) ev.push({ type: 'NodesRevealed', nodes: revealed });
  const clues = added(prev.clues, next.clues);
  if (clues.length) ev.push({ type: 'CluesFound', clues });
  for (const id of Object.keys(next.nodes))
    if (next.nodes[id]?.compromised && !prev.nodes[id]?.compromised) ev.push({ type: 'NodeCompromised', node: id });
  for (const segment of added(prev.segmentsOpen, next.segmentsOpen)) ev.push({ type: 'SegmentOpened', segment });
  for (const card of added(prev.codex, next.codex)) ev.push({ type: 'CodexUnlocked', card });
  for (const [track, to] of Object.entries(next.tracks)) {
    const from = prev.tracks[track] ?? 0;
    if (from !== to) ev.push({ type: 'TrackChanged', track, from, to });
  }
  for (const objective of added(prev.objectives, next.objectives)) ev.push({ type: 'ObjectiveCompleted', objective });
  if (next.tick !== prev.tick) ev.push({ type: 'Ticked', tick: next.tick });
  if (next.phase === 'report' && prev.phase !== 'report') ev.push({ type: 'TargetReached' });
  if (next.phase === 'caught' && prev.phase !== 'caught') ev.push({ type: 'Caught' });
  return ev;
}
