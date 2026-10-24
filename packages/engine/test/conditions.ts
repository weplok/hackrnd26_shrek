// Condition and effect language: closed set, node states, NPC facts (T-B4).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as E from '../src/index.ts';
import { applyEffects } from '../src/effects.ts';
import type { Condition, Effect, GameState } from '../src/index.ts';
import { loadContent } from './content.ts';

const content = loadContent();
const defs = (
  JSON.parse(readFileSync(join(import.meta.dirname, '../../../content/schemas/common.schema.json'), 'utf-8')) as {
    definitions: Record<string, { oneOf?: { $ref: string }[]; required?: string[]; enum?: string[] }>;
  }
).definitions;

// One atom key per schema variant, e.g. ConditionHasClue -> hasClue.
function variantKeys(union: string): string[] {
  return (defs[union]?.oneOf ?? []).map((v) => defs[v.$ref.split('/').pop() ?? '']?.required?.[0] ?? '');
}

const SAMPLE_CONDITIONS: Record<string, Condition> = {
  all: { all: [{ tickAtLeast: 0 }] },
  any: { any: [{ tickAtLeast: 0 }] },
  not: { not: { tickAtLeast: 0 } },
  nodeState: { nodeState: { node: 'wifi', state: 'visible' } },
  hasClue: { hasClue: 'x' },
  hasKey: { hasKey: 'x' },
  segmentOpen: { segmentOpen: 'x' },
  flag: { flag: 'x' },
  npcFactRevealed: { npcFactRevealed: { npc: 'x', fact: 'y' } },
  trackBelow: { trackBelow: { track: 'alarm', value: 1 } },
  trackAbove: { trackAbove: { track: 'alarm', value: 1 } },
  maxAlarmBelow: { maxAlarmBelow: 1 },
  scansBelow: { scansBelow: 1 },
  lockFilled: { lockFilled: 'x' },
  tickAtLeast: { tickAtLeast: 1 },
};
const SAMPLE_EFFECTS: Record<string, Effect> = {
  revealNodes: { revealNodes: ['wifi'] },
  grantClues: { grantClues: ['x'] },
  openSegment: { openSegment: 'x' },
  setFlag: { setFlag: 'x' },
  addTrack: { addTrack: { track: 'logs', delta: 5 } },
  unlockCodex: { unlockCodex: 'SL-01' },
  flipperSay: { flipperSay: 'x' },
  completeObjective: { completeObjective: 'x' },
  compromiseNode: { compromiseNode: 'wifi' },
};

function start(caseId = 'L1C1'): GameState {
  const d = content.campaign.levels[0]?.difficulty;
  if (!d) throw new Error('no level 0');
  return E.startCase(content, E.createGame(content, caseId, d, 777));
}

void test('engine handles exactly the condition atoms and effects of the schema', () => {
  assert.deepEqual(variantKeys('Condition').sort(), Object.keys(SAMPLE_CONDITIONS).sort());
  assert.deepEqual(variantKeys('Effect').sort(), Object.keys(SAMPLE_EFFECTS).sort());
  const s = start();
  for (const c of Object.values(SAMPLE_CONDITIONS)) assert.equal(typeof E.evalCondition(c, s), 'boolean');
  let compromised = '';
  applyEffects(Object.values(SAMPLE_EFFECTS), s, (id) => (compromised = id));
  assert.equal(compromised, 'wifi');
  assert.equal(s.tracks.logs, 5);
});

void test('unknown atoms and effects are rejected, not silently ignored', () => {
  const s = start();
  assert.throws(() => E.evalCondition({ hasCookie: 'x' } as unknown as Condition, s), /unknown condition atom/);
  assert.throws(() => {
    applyEffects([{ eatCookie: 'x' } as unknown as Effect], s);
  }, /unknown effect/);
});

void test('every nodeState value is evaluated', () => {
  const s = start();
  const states = defs.NodeStateValue?.enum ?? [];
  const at = (node: string, state: string) => E.evalCondition({ nodeState: { node, state } } as Condition, s);
  for (const st of states) assert.equal(typeof at('wifi', st), 'boolean');
  assert.equal(at('wifi', 'visible'), true);
  assert.equal(at('wifi', 'untouched'), true);
  assert.equal(at('router', 'hidden'), true);
  const wifi = s.nodes.wifi;
  if (!wifi) throw new Error('no wifi');
  wifi.compromised = true;
  assert.equal(at('wifi', 'compromised'), true);
  assert.equal(at('wifi', 'untouched'), false);
  s.tracks.alarm = 50;
  assert.deepEqual(
    ['calm', 'alerted', 'detected'].map((st) => at('wifi', st)),
    [false, true, false],
  );
});

void test('revealed node of a closed segment is dim until the segment opens', () => {
  const s = start('L2C1');
  const seg = content.cases.L2C1?.segments.find((x) => !x.openAtStart)?.id;
  const node = content.cases.L2C1?.nodes.find((n) => n.segment === seg)?.id;
  if (!seg || !node) throw new Error('L2C1 has no closed segment');
  const rt = s.nodes[node];
  if (!rt) throw new Error('no node');
  rt.revealed = true;
  const at = (state: string) => E.evalCondition({ nodeState: { node, state } } as Condition, s);
  assert.deepEqual([at('dim'), at('visible')], [true, false]);
  applyEffects([{ openSegment: seg }], s);
  assert.deepEqual([at('dim'), at('visible')], [false, true]);
});

void test('npcFactRevealed checks the specific fact the NPC gave away', () => {
  let s = start('L2C1');
  const fact = (f: string) => E.evalCondition({ npcFactRevealed: { npc: 'kostya', fact: f } }, s);
  assert.equal(fact('admin_is_anton'), false);
  s = E.scan(content, s, 'guest_wifi');
  s = E.submitPuzzle(content, s, s.activePuzzle?.correct ?? []);
  s = E.present(content, s, 'kostya', 'friendly', []);
  assert.equal(s.npc.kostya?.yielded, true);
  assert.equal(fact('admin_is_anton'), true);
  assert.equal(fact('marina_phrase'), false);
});
