// Out-of-scope warning, confirmation and consequence fork (T-B7).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as E from '../src/index.ts';
import type { GameEvent, GameState } from '../src/index.ts';
import { loadContent } from './content.ts';

const content = loadContent();
const types = (ev: GameEvent[]) => ev.map((e) => e.type);

// L2C1 with the out-of-scope cameras node revealed.
function start(): GameState {
  const d = content.campaign.levels[1]?.difficulty;
  if (!d) throw new Error('no level 1');
  let s = E.startCase(content, E.createGame(content, 'L2C1', d, 4242));
  s = E.scan(content, s, 'guest_wifi');
  s = E.submitPuzzle(content, s, s.activePuzzle?.correct ?? []);
  assert.equal(s.nodes.cameras?.revealed, true);
  return s;
}

void test('first action on an out-of-scope node only warns and blocks other commands', () => {
  const s = start();
  const r = E.apply(content, s, { type: 'ScanNode', node: 'cameras' });
  assert.deepEqual(r.events, [{ type: 'ScopeWarning', node: 'cameras' }]);
  assert.equal(r.state.tick, s.tick);
  assert.equal(r.state.tracks.alarm, s.tracks.alarm);
  assert.deepEqual(E.apply(content, r.state, { type: 'ScanNode', node: 'mail' }).events, [
    { type: 'CommandRejected', reason: 'scope-pending' },
  ]);
  assert.deepEqual(E.apply(content, r.state, { type: 'ConfirmOutOfScope', node: 'mail' }).events, [
    { type: 'CommandRejected', reason: 'no-scope-pending' },
  ]);
});

void test('declining keeps the contract clean', () => {
  const warned = E.apply(content, start(), { type: 'ScanNode', node: 'cameras' }).state;
  const r = E.apply(content, warned, { type: 'DeclineOutOfScope' });
  assert.deepEqual(types(r.events), ['ScopeDeclined']);
  assert.equal(r.state.pendingScope, null);
  assert.equal(r.state.flags.scope_violated, undefined);
  assert.deepEqual(E.apply(content, r.state, { type: 'DeclineOutOfScope' }).events, [
    { type: 'CommandRejected', reason: 'no-scope-pending' },
  ]);
});

void test('confirming records the violation, shows the consequence map and opens the node', () => {
  const warned = E.apply(content, start(), { type: 'ScanNode', node: 'cameras' }).state;
  const r = E.apply(content, warned, { type: 'ConfirmOutOfScope', node: 'cameras' });
  assert.deepEqual(r.events.slice(0, 2), [
    { type: 'ScopeViolated', node: 'cameras' },
    { type: 'ConsequenceShown', consequence: 'oos_college', reputationDelta: -25 },
  ]);
  assert.equal(r.state.flags.scope_violated, true);
  assert.equal(r.state.pendingScope, null);
  assert.ok((r.state.noise.cameras ?? 0) > 0);
  // The warning is asked once; further actions on the node run normally.
  assert.deepEqual(E.apply(content, r.state, { type: 'ScanNode', node: 'cameras' }).events, [
    { type: 'ScanOpened', node: 'cameras' },
  ]);
});

void test('a violation survives a checkpoint rollback', () => {
  const warned = E.apply(content, start(), { type: 'ScanNode', node: 'cameras' }).state;
  const s = E.apply(content, warned, { type: 'ConfirmOutOfScope', node: 'cameras' }).state;
  const caught: GameState = { ...s, phase: 'caught' };
  const restored = E.apply(content, caught, { type: 'RestoreCheckpoint' });
  assert.equal(restored.state.phase, 'playing');
  assert.equal(restored.state.flags.scope_violated, true);
});
