// Command pipeline (TZ 7.2–7.3): validate → handler → events derived from the state diff.
import type { Content, ContentNode, GameState } from './types.ts';
import {
  scan,
  hypothesize,
  submitPuzzle,
  cancelPuzzle,
  restoreCheckpoint,
  failHint,
  combine,
  fillSocket,
  confirmScope,
  needsScopeConfirm,
  answerReport,
} from './engine.ts';
import { verifyPuzzle } from './puzzles/index.ts';

export type Command =
  | { type: 'ScanNode'; node: string }
  | { type: 'ProposeHypothesis'; node: string; vuln: string }
  | { type: 'SubmitPuzzle'; answer: string[] }
  | { type: 'CancelPuzzle' }
  | { type: 'CombineClues'; a: string; b: string }
  | { type: 'FillSocket'; node: string; socket: string; key: string }
  | { type: 'ConfirmOutOfScope'; node: string }
  | { type: 'DeclineOutOfScope' }
  | { type: 'AnswerReport'; finding: string; option: string }
  | { type: 'RestoreCheckpoint' };

export type RejectReason =
  | 'not-playing'
  | 'unknown-node'
  | 'node-hidden'
  | 'node-dim'
  | 'no-socket'
  | 'socket-filled'
  | 'scope-pending'
  | 'no-scope-pending'
  | 'puzzle-active'
  | 'no-puzzle'
  | 'not-scanned'
  | 'not-exploitable'
  | 'not-report'
  | 'not-caught';

export type GameEvent =
  | { type: 'CommandRejected'; reason: RejectReason }
  | { type: 'ScanOpened'; node: string }
  | { type: 'NodeScanned'; node: string; repeat: boolean }
  | { type: 'NodesRevealed'; nodes: string[] }
  | { type: 'CluesFound'; clues: string[] }
  | { type: 'TrackChanged'; track: string; from: number; to: number }
  | { type: 'KeyAssembled'; key: string }
  | { type: 'CombineFailed'; a: string; b: string }
  | { type: 'SocketFilled'; node: string; socket: string }
  | { type: 'SocketRejected'; node: string; socket: string; key: string }
  | { type: 'LockOpened'; node: string }
  | { type: 'ScopeWarning'; node: string }
  | { type: 'ScopeViolated'; node: string }
  | { type: 'ScopeDeclined'; node: string }
  | { type: 'ConsequenceShown'; consequence: string; reputationDelta: number }
  | { type: 'PuzzleOpened'; node: string; vuln: string }
  | { type: 'PuzzleCancelled'; node: string }
  | { type: 'PuzzleSolved'; node: string }
  | { type: 'PuzzleFailed'; node: string; attemptsLeft: number }
  | { type: 'ExploitSucceeded'; node: string; vuln: string }
  | { type: 'ExploitMismatched'; node: string; vuln: string; failHint: string }
  | { type: 'NodeCompromised'; node: string }
  | { type: 'SegmentOpened'; segment: string }
  | { type: 'CodexUnlocked'; card: string }
  | { type: 'ObjectiveCompleted'; objective: string }
  | { type: 'NodeSecured'; node: string }
  | { type: 'ReportAnswered'; finding: string; correct: boolean }
  | { type: 'CaseWon' }
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
  if (cmd.type === 'AnswerReport') return s.phase === 'report' ? null : 'not-report';
  if (s.phase !== 'playing') return 'not-playing';
  if (cmd.type === 'ConfirmOutOfScope') return s.pendingScope === cmd.node ? null : 'no-scope-pending';
  if (cmd.type === 'DeclineOutOfScope') return s.pendingScope ? null : 'no-scope-pending';
  // The out-of-scope dialog is modal: it must be answered first.
  if (s.pendingScope) return 'scope-pending';
  switch (cmd.type) {
    case 'ScanNode':
    case 'ProposeHypothesis': {
      const n = content.cases[s.caseId]?.nodes.find((x) => x.id === cmd.node);
      if (!n) return 'unknown-node';
      if (!s.nodes[cmd.node]?.revealed) return 'node-hidden';
      if (isDim(n, s)) return 'node-dim';
      if (s.activePuzzle) return 'puzzle-active';
      if (cmd.type === 'ScanNode') return null;
      if (needsScopeConfirm(s, n)) return null;
      if (n.kind === 'person' || n.lock) return 'not-exploitable';
      return null;
    }
    case 'SubmitPuzzle':
    case 'CancelPuzzle':
      return s.activePuzzle ? null : 'no-puzzle';
    case 'CombineClues':
      return s.activePuzzle ? 'puzzle-active' : null;
    case 'FillSocket': {
      const n = content.cases[s.caseId]?.nodes.find((x) => x.id === cmd.node);
      if (!n) return 'unknown-node';
      if (!s.nodes[cmd.node]?.revealed) return 'node-hidden';
      if (isDim(n, s)) return 'node-dim';
      if (s.activePuzzle) return 'puzzle-active';
      if (!n.lock?.sockets.some((x) => x.id === cmd.socket)) return 'no-socket';
      if (s.sockets[cmd.node]?.[cmd.socket]) return 'socket-filled';
      return null;
    }
  }
}

// FR-024 / TZ 7.1: a node of a closed segment is dim and takes no actions,
// except the gateway itself: the node whose compromise opens its own segment.
function isDim(n: ContentNode, s: GameState): boolean {
  if (s.segmentsOpen[n.segment] !== false) return false;
  return !n.onCompromise.some((e) => 'openSegment' in e && e.openSegment === n.segment);
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
    case 'CombineClues':
      return combine(content, s, [cmd.a, cmd.b]);
    case 'FillSocket':
      return fillSocket(content, s, cmd.node, cmd.socket, cmd.key);
    case 'ConfirmOutOfScope':
      return confirmScope(content, s, true);
    case 'DeclineOutOfScope':
      return confirmScope(content, s, false);
    case 'AnswerReport':
      return answerReport(content, s, cmd.finding, cmd.option);
  }
}

function primaryEvents(content: Content, prev: GameState, next: GameState, cmd: Command): GameEvent[] {
  if (next.pendingScope && !prev.pendingScope) return [{ type: 'ScopeWarning', node: next.pendingScope }];
  switch (cmd.type) {
    case 'ScanNode':
      if (next.activePuzzle?.action === 'scan') return [{ type: 'ScanOpened', node: cmd.node }];
      return [{ type: 'NodeScanned', node: cmd.node, repeat: !!prev.nodes[cmd.node]?.scanned }];
    case 'ProposeHypothesis':
      return [{ type: 'PuzzleOpened', node: cmd.node, vuln: cmd.vuln }];
    case 'CancelPuzzle':
      return [{ type: 'PuzzleCancelled', node: prev.activePuzzle?.nodeId ?? '' }];
    case 'RestoreCheckpoint':
      return [{ type: 'CheckpointRestored', checkpoint: next.checkpoint?.id ?? '' }];
    case 'ConfirmOutOfScope': {
      const ev: GameEvent[] = [{ type: 'ScopeViolated', node: cmd.node }];
      const id = content.cases[prev.caseId]?.scope.consequence;
      const cons = id ? content.consequences[id] : undefined;
      if (cons) ev.push({ type: 'ConsequenceShown', consequence: cons.id, reputationDelta: cons.reputationDelta });
      return ev;
    }
    case 'DeclineOutOfScope':
      return [{ type: 'ScopeDeclined', node: prev.pendingScope ?? '' }];
    case 'CombineClues': {
      const keys = added(prev.keys, next.keys);
      if (!keys.length) return [{ type: 'CombineFailed', a: cmd.a, b: cmd.b }];
      return keys.map((key) => ({ type: 'KeyAssembled', key }));
    }
    case 'FillSocket': {
      if (!next.sockets[cmd.node]?.[cmd.socket])
        return [{ type: 'SocketRejected', node: cmd.node, socket: cmd.socket, key: cmd.key }];
      const ev: GameEvent[] = [{ type: 'SocketFilled', node: cmd.node, socket: cmd.socket }];
      if (next.nodes[cmd.node]?.compromised && !prev.nodes[cmd.node]?.compromised)
        ev.push({ type: 'LockOpened', node: cmd.node });
      return ev;
    }
    case 'AnswerReport': {
      const finding = content.cases[prev.caseId]?.report.findings.find((item) => item.id === cmd.finding);
      const correct =
        !!prev.nodes[finding?.node ?? '']?.compromised &&
        (finding?.options.find((option) => option.id === cmd.option)?.correct ?? false);
      return [{ type: 'ReportAnswered', finding: cmd.finding, correct }];
    }
    case 'SubmitPuzzle': {
      const inst = prev.activePuzzle;
      if (!inst) return [];
      const node = inst.nodeId;
      if (!verifyPuzzle(inst, cmd.answer))
        return [{ type: 'PuzzleFailed', node, attemptsLeft: next.activePuzzle?.attemptsLeft ?? 0 }];
      if (inst.action === 'scan')
        return [
          { type: 'PuzzleSolved', node },
          { type: 'NodeScanned', node, repeat: false },
        ];
      if (next.nodes[node]?.compromised && !prev.nodes[node]?.compromised)
        return [
          { type: 'PuzzleSolved', node },
          { type: 'ExploitSucceeded', node, vuln: inst.vuln },
        ];
      const n = content.cases[prev.caseId]?.nodes.find((x) => x.id === node);
      return [
        { type: 'PuzzleSolved', node },
        { type: 'ExploitMismatched', node, vuln: inst.vuln, failHint: failHint(n, inst) },
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
  for (const id of Object.keys(next.nodes))
    if (next.nodes[id]?.secured && !prev.nodes[id]?.secured) ev.push({ type: 'NodeSecured', node: id });
  for (const segment of added(prev.segmentsOpen, next.segmentsOpen)) ev.push({ type: 'SegmentOpened', segment });
  for (const card of added(prev.codex, next.codex)) ev.push({ type: 'CodexUnlocked', card });
  for (const [track, to] of Object.entries(next.tracks)) {
    const from = prev.tracks[track] ?? 0;
    if (from !== to) ev.push({ type: 'TrackChanged', track, from, to });
  }
  for (const objective of added(prev.objectives, next.objectives)) ev.push({ type: 'ObjectiveCompleted', objective });
  if (next.tick !== prev.tick) ev.push({ type: 'Ticked', tick: next.tick });
  if (next.phase === 'report' && prev.phase !== 'report') ev.push({ type: 'TargetReached' });
  if (next.phase === 'won' && prev.phase !== 'won') ev.push({ type: 'CaseWon' });
  if (next.phase === 'caught' && prev.phase !== 'caught') ev.push({ type: 'Caught' });
  return ev;
}
