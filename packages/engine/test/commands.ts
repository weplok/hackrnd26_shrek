// Command pipeline: validation, rejections and derived events (T-B3).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as E from '../src/index.ts';
import type { GameEvent, GameState } from '../src/index.ts';
import { loadContent } from './content.ts';

const content = loadContent();

function start(): GameState {
  const d = content.campaign.levels[0]?.difficulty;
  if (!d) throw new Error('no level 0');
  return E.startCase(content, E.createGame(content, 'L1C1', d, 777));
}
const types = (ev: GameEvent[]) => ev.map((e) => e.type);

function scanNode(state: GameState, node: string): GameState {
  const opened = E.apply(content, state, { type: 'ScanNode', node });
  assert.deepEqual(opened.events, [{ type: 'ScanOpened', node }]);
  return E.apply(content, opened.state, { type: 'SubmitPuzzle', answer: opened.state.activePuzzle?.correct ?? [] }).state;
}

void test('commands before contract signing are rejected', () => {
  const d = content.campaign.levels[0]?.difficulty;
  if (!d) throw new Error('no level 0');
  const s = E.createGame(content, 'L1C1', d, 777);
  const r = E.apply(content, s, { type: 'ScanNode', node: 'wifi' });
  assert.equal(r.state, s);
  assert.deepEqual(r.events, [{ type: 'CommandRejected', reason: 'not-playing' }]);
});

void test('scan reveals neighbours and clues; repeat scan only adds noise', () => {
  const s = start();
  assert.equal(E.apply(content, s, { type: 'ScanNode', node: 'router' }).events[0]?.type, 'CommandRejected');
  const opened = E.apply(content, s, { type: 'ScanNode', node: 'wifi' });
  assert.deepEqual(opened.events, [{ type: 'ScanOpened', node: 'wifi' }]);
  const r = E.apply(content, opened.state, { type: 'SubmitPuzzle', answer: opened.state.activePuzzle?.correct ?? [] });
  const scanned = r.events.find((event) => event.type === 'NodeScanned');
  assert.deepEqual(scanned, { type: 'NodeScanned', node: 'wifi', repeat: false });
  assert.equal(r.state.nodes.wifi?.alertLevel, 'alerted');
  const revealed = r.events.find((e) => e.type === 'NodesRevealed');
  assert.deepEqual(revealed, { type: 'NodesRevealed', nodes: ['router', 'speaker'] });
  assert.ok(types(r.events).includes('CluesFound'));
  assert.ok(types(r.events).includes('Ticked'));
  const again = E.apply(content, r.state, { type: 'ScanNode', node: 'wifi' });
  assert.deepEqual(again.events[0], { type: 'NodeScanned', node: 'wifi', repeat: true });
  assert.ok(!types(again.events).includes('CluesFound'));
  assert.equal(again.state.tick, r.state.tick + 1);
  assert.ok((again.state.tracks.alarm ?? 0) >= (r.state.tracks.alarm ?? 0));
  assert.equal(again.state.nodes.wifi?.alertLevel, 'detected');
});

void test('hypothesis works without a scan and allows a single active puzzle', () => {
  const s = start();
  const r = E.apply(content, s, { type: 'ProposeHypothesis', node: 'wifi', vuln: 'SL-02' });
  assert.deepEqual(r.events, [{ type: 'PuzzleOpened', node: 'wifi', vuln: 'SL-02' }]);
  assert.equal(
    E.apply(content, r.state, { type: 'ProposeHypothesis', node: 'wifi', vuln: 'SL-01' }).events[0]?.type,
    'CommandRejected',
  );
});

void test('cancel before submit is silent: no tick, no noise', () => {
  let s = start();
  s = scanNode(s, 'wifi');
  s = E.apply(content, s, { type: 'ProposeHypothesis', node: 'wifi', vuln: 'SL-02' }).state;
  const r = E.apply(content, s, { type: 'CancelPuzzle' });
  assert.deepEqual(r.events, [{ type: 'PuzzleCancelled', node: 'wifi' }]);
  assert.equal(r.state.tick, s.tick);
  assert.equal(r.state.activePuzzle, null);
  assert.deepEqual(E.apply(content, r.state, { type: 'CancelPuzzle' }).events, [
    { type: 'CommandRejected', reason: 'no-puzzle' },
  ]);
});

void test('solved genuine exploit takes the node and reaches the target', () => {
  let s = start();
  s = scanNode(s, 'wifi');
  s = scanNode(s, 'speaker');
  s = E.apply(content, s, { type: 'ProposeHypothesis', node: 'wifi', vuln: 'SL-02' }).state;
  const r = E.apply(content, s, { type: 'SubmitPuzzle', answer: s.activePuzzle?.correct ?? [] });
  const t = types(r.events);
  assert.deepEqual(t.slice(0, 2), ['PuzzleSolved', 'ExploitSucceeded']);
  assert.ok(t.includes('NodeCompromised'));
  assert.ok(t.includes('TargetReached'));
  assert.equal(r.state.phase, 'report');
});

void test('solved puzzle for the wrong vuln reports mismatch with failHint', () => {
  let s = start();
  s = scanNode(s, 'wifi');
  s = E.apply(content, s, { type: 'ProposeHypothesis', node: 'wifi', vuln: 'SL-01' }).state;
  const r = E.apply(content, s, { type: 'SubmitPuzzle', answer: s.activePuzzle?.correct ?? [] });
  const hint = content.cases.L1C1?.nodes.find((n) => n.id === 'wifi')?.failHints['SL-01'];
  assert.deepEqual(r.events[1], { type: 'ExploitMismatched', node: 'wifi', vuln: 'SL-01', failHint: hint });
  assert.equal(r.state.nodes.wifi?.compromised, false);
  assert.equal(r.state.nodes.wifi?.alertLevel, 'detected');
});

void test('wrong answer costs an attempt and makes noise; last attempt closes the puzzle', () => {
  let s = start();
  s = scanNode(s, 'wifi');
  s = E.apply(content, s, { type: 'ProposeHypothesis', node: 'wifi', vuln: 'SL-02' }).state;
  const attempts = s.activePuzzle?.attemptsLeft ?? 0;
  assert.equal(attempts, 6);
  const wrong = s.activePuzzle?.options.find((o) => !s.activePuzzle?.correct.includes(o.id))?.id ?? '';
  const r = E.apply(content, s, { type: 'SubmitPuzzle', answer: [wrong] });
  assert.deepEqual(r.events[0], { type: 'PuzzleFailed', node: 'wifi', attemptsLeft: attempts - 1 });
  assert.ok(types(r.events).includes('Ticked'));
  assert.equal(r.state.activePuzzle?.attemptsLeft, attempts - 1);
  assert.equal(r.state.nodes.wifi?.alertLevel, 'detected');
  s = r.state;
  for (let i = 1; i < attempts; i++) s = E.apply(content, s, { type: 'SubmitPuzzle', answer: [wrong] }).state;
  assert.equal(s.activePuzzle, null);
});
