// Puzzle registry and the L1/L2 archetypes: 01, 02, 04, 05, 06, 07, 08 (T-B5).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as E from '../src/index.ts';
import type { PuzzleInstance } from '../src/index.ts';
import { loadContent } from './content.ts';

const content = loadContent();
const ARCHETYPES = [
  'sticker',
  'password-wheel',
  'expired-patch',
  'legend-mosaic',
  'trust-path',
  'forgotten-key',
  'wall',
];

// Every exploit of the shipped cases, with the knobs the engine would merge for it.
const exploits = Object.values(content.cases).flatMap((c) =>
  c.nodes.flatMap((n) =>
    n.exploits.map((ex) => ({
      caseId: c.id,
      node: n.id,
      vuln: ex.vuln,
      params: ex.puzzleParams,
      knobs: ex.knobs ?? {},
    })),
  ),
);
const archOf = (vuln: string) => content.puzzles[vuln]?.archetype ?? 'default';
const gen = (vuln: string, params: object, knobs: object, seed: number): PuzzleInstance =>
  E.generatePuzzle(seed, archOf(vuln), vuln, params as Record<string, unknown>, knobs, 'n', vuln)[1];

void test('registry has a plugin for every archetype of Neighbour and College', () => {
  for (const a of ARCHETYPES) assert.equal(E.PUZZLES[a]?.archetype, a);
  for (const ex of exploits) assert.ok(E.PUZZLES[archOf(ex.vuln)], `${ex.caseId}/${ex.node} ${ex.vuln}`);
});

void test('generation is deterministic per seed and always solvable', () => {
  for (const ex of exploits)
    for (const seed of [1, 42, 777, 123456]) {
      const a = gen(ex.vuln, ex.params, ex.knobs, seed);
      assert.deepEqual(a, gen(ex.vuln, ex.params, ex.knobs, seed));
      assert.ok(a.correct.length > 0 && a.correct.every((id) => a.options.some((o) => o.id === id)));
      assert.equal(new Set(a.options.map((o) => o.label)).size, a.options.length);
      assert.deepEqual(E.checkPuzzle(a, a.correct), { solved: true, mistakes: 0 });
      assert.equal(E.checkPuzzle(a, []).solved, false);
    }
});

void test('decoy count follows knobs', () => {
  const few = gen('SL-01', { credentials: 'admin/admin' }, { decoys: 1 }, 7);
  const many = gen('SL-01', { credentials: 'admin/admin' }, { decoys: 4 }, 7);
  assert.deepEqual([few.options.length, many.options.length], [2, 5]);
});

void test('password wheel and trust path check the order of slots', () => {
  const wheel = gen('SL-02', { answer: 'barsik123', decoys: ['qwerty123'] }, {}, 3);
  assert.deepEqual(
    wheel.correct.map((id) => wheel.options.find((o) => o.id === id)?.label),
    ['barsik', '123'],
  );
  assert.deepEqual(E.checkPuzzle(wheel, [...wheel.correct].reverse()), { solved: false, mistakes: 2 });
  const path = gen('SL-06', { trustPath: ['a', 'b', 'c'] }, { decoys: 2 }, 3);
  assert.equal(path.ordered, true);
  const extra = path.options.find((o) => !path.correct.includes(o.id))?.id ?? '';
  assert.deepEqual(E.checkPuzzle(path, [...path.correct, extra]), { solved: false, mistakes: 1 });
});

void test('multi-select mosaic counts wrong and missed tiles as mistakes', () => {
  const m = gen('SL-05', { sources: ['about_page', 'mail_headers', 'dept_pages'] }, { decoys: 3 }, 9);
  const decoy = m.options.find((o) => !m.correct.includes(o.id))?.id ?? '';
  assert.deepEqual(E.checkPuzzle(m, [...m.correct.slice(1), decoy]), { solved: false, mistakes: 2 });
});

void test('archetype views carry the data the mechanic needs', () => {
  const patch = gen('SL-04', { component: 'portal-cms' }, { decoys: 2 }, 5);
  const rows = patch.view.rows as { component: string; version: string; fixedIn: string }[];
  const behind = rows.filter((r) => Number(r.version) < Number(r.fixedIn));
  assert.deepEqual(
    behind.map((r) => r.component),
    ['portal-cms'],
  );
  const key = gen('SL-07', { accounts: ['ivanova', 'test_svc', 'temp_backup'], forgotten: 'test_svc' }, {}, 5);
  const owners = key.view.rows as { name: string; owner: string }[];
  assert.deepEqual(
    owners.filter((r) => r.owner === '—').map((r) => r.name),
    ['test_svc'],
  );
  const sticker = gen('SL-01', { credentials: 'admin/admin', model: 'RT-300' }, { decoys: 2 }, 5);
  const book = sticker.view.handbook as { model: string; pair: string }[];
  assert.equal(book.find((r) => r.model === sticker.view.device)?.pair, 'admin/admin');
});

void test('engine merges level knobs with node knobs and labels trust path nodes', () => {
  const d = content.campaign.levels[1]?.difficulty;
  if (!d) throw new Error('no level 1');
  let s = E.startCase(content, E.createGame(content, 'L2C1', d, 5));
  s = E.scan(content, s, 'guest_wifi');
  s = E.hypothesize(content, s, 'guest_wifi', 'SL-02');
  assert.equal(s.activePuzzle?.attemptsLeft, 4);
  assert.equal(s.activePuzzle.genuine, true);
  s = E.cancelPuzzle(content, s);
  s = E.hypothesize(content, s, 'guest_wifi', 'SL-07');
  assert.equal(s.activePuzzle?.genuine, false);
  assert.ok(!s.activePuzzle.options.some((o) => o.label === 'test_svc'), 'non-genuine instance uses neutral data');
});
