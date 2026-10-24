// Unit tests for the engine core: RNG, condition language, effect application.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mulberry32, shuffle } from '../src/rng.ts';
import { evalCondition } from '../src/conditions.ts';
import { applyEffects, clamp } from '../src/effects.ts';
import type { GameState } from '../src/types.ts';

function state(): GameState {
  return {
    caseId: 'L1C1',
    phase: 'playing',
    tick: 3,
    scans: 0,
    socialActions: 0,
    techActions: 0,
    nodes: { wifi: { revealed: false, scanned: true, compromised: false, secured: false } },
    segmentsOpen: { lan: false },
    clues: { ssid: true },
    keys: {},
    flags: {},
    tracks: { alarm: 40 },
    maxAlarm: 40,
    noise: {},
    checkpointsReached: {},
    checkpoint: null,
    codex: {},
    npc: { kostya: { suspicion: 10, locked: false, yielded: true } },
    sockets: { dean: { a: true, b: false } },
    objectives: {},
    report: {},
    rng: 1,
    activePuzzle: null,
    activeChat: null,
    pendingScope: null,
    rank: null,
    log: [],
    difficulty: {
      noiseMultiplier: 1,
      alarmDecayPerTick: 0,
      wrongGuessNoise: 5,
      hints: { frequency: 'low', depth: 'nudge' },
      flipperPreWarn: false,
      puzzleKnobs: {},
    },
  };
}

void test('mulberry32 is deterministic per seed and in [0, 1)', () => {
  const a = mulberry32(42),
    b = mulberry32(42),
    c = mulberry32(43);
  const xs = [a(), a(), a()];
  assert.deepEqual(xs, [b(), b(), b()]);
  assert.notEqual(xs[0], c());
  for (const x of xs) assert.ok(x >= 0 && x < 1);
});

void test('shuffle is a deterministic permutation and threads state', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const [s1, out1] = shuffle(7, input);
  const [s2, out2] = shuffle(7, input);
  assert.deepEqual(out1, out2);
  assert.equal(s1, s2);
  assert.notEqual(s1, 7);
  assert.deepEqual([...out1].sort(), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
});

void test('evalCondition covers leaves and combinators', () => {
  const s = state();
  assert.equal(evalCondition(undefined, s), true);
  assert.equal(evalCondition({ hasClue: 'ssid' }, s), true);
  assert.equal(evalCondition({ hasKey: 'admin' }, s), false);
  assert.equal(evalCondition({ nodeState: { node: 'wifi', state: 'scanned' } }, s), true);
  assert.equal(evalCondition({ nodeState: { node: 'missing', state: 'scanned' } }, s), false);
  assert.equal(evalCondition({ npcFactRevealed: { npc: 'kostya', fact: 'pc_name' } }, s), true);
  assert.equal(evalCondition({ trackBelow: { track: 'alarm', value: 50 } }, s), true);
  assert.equal(evalCondition({ trackAbove: { track: 'alarm', value: 50 } }, s), false);
  assert.equal(evalCondition({ lockFilled: 'dean' }, s), false);
  assert.equal(evalCondition({ tickAtLeast: 3 }, s), true);
  assert.equal(evalCondition({ all: [{ hasClue: 'ssid' }, { tickAtLeast: 4 }] }, s), false);
  assert.equal(evalCondition({ any: [{ hasClue: 'ssid' }, { tickAtLeast: 4 }] }, s), true);
  assert.equal(evalCondition({ not: { segmentOpen: 'lan' } }, s), true);
});

void test('applyEffects mutates the draft and clamps tracks', () => {
  const s = state();
  applyEffects(
    [
      { revealNodes: ['wifi', 'missing'] },
      { grantClues: ['ssid', 'cat'] },
      { openSegment: 'lan' },
      { setFlag: 'met_kostya' },
      { addTrack: { track: 'alarm', delta: 90 } },
      { unlockCodex: 'SL-02' },
      { completeObjective: 'o1' },
    ],
    s,
  );
  assert.equal(s.nodes.wifi?.revealed, true);
  assert.equal(s.nodes.missing, undefined);
  assert.deepEqual(s.clues, { ssid: true, cat: true });
  assert.equal(s.segmentsOpen.lan, true);
  assert.equal(s.flags.met_kostya, true);
  assert.equal(s.tracks.alarm, 100);
  assert.equal(s.codex['SL-02'], true);
  assert.equal(s.objectives.o1, true);
  assert.equal(s.log.filter((e) => e.kind === 'clue').length, 1);
  assert.equal(clamp(-5), 0);
});

void test('compromiseNode delegates to the engine callback', () => {
  const s = state();
  const taken: string[] = [];
  applyEffects([{ compromiseNode: 'wifi' }], s, (id) => taken.push(id));
  assert.deepEqual(taken, ['wifi']);
});
