// Alarm, caught state and checkpoint rollback (T-B2).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as E from '../src/index.ts';
import type { GameState } from '../src/index.ts';
import { loadContent } from './content.ts';

const content = loadContent();

function start(): GameState {
  const d = content.campaign.levels[0]?.difficulty;
  if (!d) throw new Error('no level 0');
  return E.startCase(content, E.createGame(content, 'L1C1', d, 777));
}

void test('alarm levels follow the 30/60/85 thresholds', () => {
  assert.deepEqual([0, 29, 30, 59, 60, 84, 85, 100].map(E.alarmLevel), [
    'calm',
    'calm',
    'alert',
    'alert',
    'growl',
    'growl',
    'bark',
    'bark',
  ]);
});

void test('case start is the first checkpoint', () => {
  const s = start();
  assert.ok(s.checkpoint);
  assert.equal(s.checkpoint.id, 'cp_start');
  assert.equal(s.checkpoint.state.checkpoint, null);
});

void test('alarm 100 catches the player; only RestoreCheckpoint is accepted', () => {
  const s = E.apply(content, start(), { type: 'ScanNode', node: 'wifi' }).state;
  s.difficulty = { ...s.difficulty, alarmDecayPerTick: 0 };
  s.tracks.alarm = 99;
  s.codex['SL-01'] = true;
  const r = E.apply(content, s, { type: 'ScanNode', node: 'wifi' });
  assert.equal(r.state.phase, 'caught');
  assert.equal(r.state.tracks.alarm, 100);
  assert.equal(r.state.maxAlarm, 100);
  assert.ok(r.events.some((e) => e.type === 'Caught'));
  assert.equal(E.noiseSources(r.state)[0]?.source, 'wifi');
  const scan = E.apply(content, r.state, { type: 'ScanNode', node: 'wifi' });
  assert.deepEqual(scan.events, [{ type: 'CommandRejected', reason: 'not-playing' }]);

  const back = E.apply(content, r.state, { type: 'RestoreCheckpoint' });
  assert.equal(back.events[0]?.type, 'CheckpointRestored');
  assert.equal(back.state.phase, 'playing');
  assert.equal(back.state.tracks.alarm, 0);
  assert.equal(back.state.nodes.wifi?.scanned, false);
  assert.equal(back.state.codex['SL-01'], true);
  assert.equal(back.state.tick, r.state.tick);
  assert.equal(back.state.maxAlarm, 100);
});

void test('RestoreCheckpoint outside caught is rejected', () => {
  const r = E.apply(content, start(), { type: 'RestoreCheckpoint' });
  assert.deepEqual(r.events, [{ type: 'CommandRejected', reason: 'not-caught' }]);
});

void test('reaching a later step moves the checkpoint and resets the noise tally', () => {
  const s = E.apply(content, start(), { type: 'ScanNode', node: 'wifi' }).state;
  assert.ok(E.noiseSources(s).length > 0);
  const n = s.nodes.wifi;
  if (!n) throw new Error('no wifi');
  n.compromised = true;
  E.recompute(content, s);
  assert.ok(s.checkpoint);
  assert.equal(s.checkpoint.id, 'cp_access');
  assert.deepEqual(s.noise, {});
  assert.equal(s.checkpoint.state.nodes.wifi?.compromised, true);
});
