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
  const r = E.apply(content, s, { type: 'ScanNode', node: 'wifi' });
  assert.deepEqual(r.events[0], { type: 'NodeScanned', node: 'wifi', repeat: false });
  const revealed = r.events.find((e) => e.type === 'NodesRevealed');
  assert.deepEqual(revealed, { type: 'NodesRevealed', nodes: ['router', 'speaker'] });
  assert.ok(types(r.events).includes('CluesFound'));
  assert.ok(types(r.events).includes('Ticked'));
  const again = E.apply(content, r.state, { type: 'ScanNode', node: 'wifi' });
  assert.deepEqual(again.events[0], { type: 'NodeScanned', node: 'wifi', repeat: true });
  assert.ok(!types(again.events).includes('CluesFound'));
  assert.equal(again.state.tick, r.state.tick + 1);
  assert.ok((again.state.tracks.alarm ?? 0) >= (r.state.tracks.alarm ?? 0));
});

void test('hypothesis needs a scanned node and a single active puzzle', () => {
  let s = start();
  const unscanned = E.apply(content, s, { type: 'ProposeHypothesis', node: 'wifi', vuln: 'SL-02' });
  assert.deepEqual(unscanned.events, [{ type: 'CommandRejected', reason: 'not-scanned' }]);
  s = E.apply(content, s, { type: 'ScanNode', node: 'wifi' }).state;
  const r = E.apply(content, s, { type: 'ProposeHypothesis', node: 'wifi', vuln: 'SL-02' });
  assert.deepEqual(r.events, [{ type: 'PuzzleOpened', node: 'wifi', vuln: 'SL-02' }]);
  assert.equal(
    E.apply(content, r.state, { type: 'ProposeHypothesis', node: 'wifi', vuln: 'SL-01' }).events[0]?.type,
    'CommandRejected',
  );
});

void test('cancel before submit is silent: no tick, no noise', () => {
  let s = start();
  s = E.apply(content, s, { type: 'ScanNode', node: 'wifi' }).state;
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
  s = E.apply(content, s, { type: 'ScanNode', node: 'wifi' }).state;
  s = E.apply(content, s, { type: 'ScanNode', node: 'speaker' }).state;
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
  s = E.apply(content, s, { type: 'ScanNode', node: 'wifi' }).state;
  s = E.apply(content, s, { type: 'ProposeHypothesis', node: 'wifi', vuln: 'SL-01' }).state;
  const r = E.apply(content, s, { type: 'SubmitPuzzle', answer: s.activePuzzle?.correct ?? [] });
  const hint = content.cases.L1C1?.nodes.find((n) => n.id === 'wifi')?.failHints['SL-01'];
  assert.deepEqual(r.events[1], { type: 'ExploitMismatched', node: 'wifi', vuln: 'SL-01', failHint: hint });
  assert.equal(r.state.nodes.wifi?.compromised, false);
});

void test('wrong answer fails the puzzle and makes noise', () => {
  let s = start();
  s = E.apply(content, s, { type: 'ScanNode', node: 'wifi' }).state;
  s = E.apply(content, s, { type: 'ProposeHypothesis', node: 'wifi', vuln: 'SL-02' }).state;
  const wrong = s.activePuzzle?.options.find((o) => !s.activePuzzle?.correct.includes(o.id))?.id ?? '';
  const r = E.apply(content, s, { type: 'SubmitPuzzle', answer: [wrong] });
  assert.equal(r.events[0]?.type, 'PuzzleFailed');
  assert.ok(types(r.events).includes('Ticked'));
  assert.equal(r.state.activePuzzle, null);
});
