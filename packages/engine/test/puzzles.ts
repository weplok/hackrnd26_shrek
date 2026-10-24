import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as E from '../src/index.ts';
import type { PuzzleInstance } from '../src/index.ts';
import { loadContent } from './content.ts';

const content = loadContent();
const ARCHETYPES = ['scan', 'exploit', 'brute', 'phish', 'evasion', 'crypto', 'rootkit', 'wipe'];
const SAMPLES: Record<string, Record<string, unknown>> = {
  scan: { ports: ['эхо: 443/tcp', 'эхо: 53/udp'] },
  exploit: { shape: 'Г-образный паз' },
  brute: { answer: 'barsik123' },
  phish: { blocks: ['Легенда', 'Зацепка', 'Тон'] },
  evasion: { path: ['Фрагмент A', 'Фрагмент B'] },
  crypto: { rotors: ['Ротор A: 7', 'Ротор B: 3', 'Ротор C: 9'] },
  rootkit: { profile: ['Процессор: 20%', 'Сеть: 10%', 'Файлы: 5%'] },
  wipe: { ownLines: ['auth: тестовая сессия', 'proxy: учебный маршрут'] },
};

function gen(archetype: string, params: Record<string, unknown>, knobs: Record<string, number> = {}, seed = 42): PuzzleInstance {
  return E.generatePuzzle(seed, archetype, archetype, params, knobs, 'node', 'SL-01')[1];
}

void test('registry has all eight tool plugins', () => {
  for (const archetype of ARCHETYPES) assert.equal(E.PUZZLES[archetype]?.archetype, archetype);
  for (const puzzle of Object.values(content.puzzles)) assert.ok(E.PUZZLES[puzzle.archetype]);
});

void test('every tool is deterministic and solvable', () => {
  for (const archetype of ARCHETYPES) {
    const first = gen(archetype, SAMPLES[archetype] ?? {}, { decoys: 2 });
    const second = gen(archetype, SAMPLES[archetype] ?? {}, { decoys: 2 });
    assert.deepEqual(first, second, archetype);
    assert.ok(first.correct.length > 0, archetype);
    assert.ok(first.correct.every((id) => first.options.some((option) => option.id === id)), archetype);
    assert.deepEqual(E.checkPuzzle(first, first.correct), { solved: true, mistakes: 0 }, archetype);
  }
});

void test('tool controls change generated views and decoy count', () => {
  const scan = gen('scan', SAMPLES.scan ?? {}, { falseEchoes: 4, fadeSteps: 2 });
  assert.equal(scan.options.length, 6);
  assert.equal(scan.view.fadeSteps, 2);
  const exploit = gen('exploit', SAMPLES.exploit ?? {}, { contourComplexity: 5 });
  assert.equal(exploit.view.contourComplexity, 5);
  const crypto = gen('crypto', SAMPLES.crypto ?? {}, { rotorCount: 2, hintCount: 3 });
  assert.equal(crypto.correct.length, 2);
  assert.equal(crypto.view.hintCount, 3);
  const rootkit = gen('rootkit', SAMPLES.rootkit ?? {}, { parameterCount: 2, edrThreshold: 90 });
  assert.equal(rootkit.correct.length, 2);
  assert.equal(rootkit.view.edrThreshold, 90);
});

void test('ordered tools reject swapped sequence and cleanup tools reject wrong selection', () => {
  for (const archetype of ['brute', 'phish', 'evasion', 'crypto', 'rootkit']) {
    const puzzle = gen(archetype, SAMPLES[archetype] ?? {});
    assert.equal(puzzle.ordered, true, archetype);
    assert.equal(E.checkPuzzle(puzzle, [...puzzle.correct].reverse()).solved, false, archetype);
  }
  for (const archetype of ['scan', 'wipe']) {
    const puzzle = gen(archetype, SAMPLES[archetype] ?? {});
    const wrong = puzzle.options.find((option) => !puzzle.correct.includes(option.id))?.id ?? '';
    assert.equal(E.checkPuzzle(puzzle, [...puzzle.correct, wrong]).solved, false, archetype);
  }
});

void test('scan opens Radar Echo and only resolves node after a correct answer', () => {
  const difficulty = content.campaign.levels[0]?.difficulty;
  if (!difficulty) throw new Error('no level 1');
  let state = E.startCase(content, E.createGame(content, 'L1C1', difficulty, 5));
  state = E.scan(content, state, 'wifi');
  assert.equal(state.activePuzzle?.action, 'scan');
  assert.equal(state.nodes.wifi?.scanned, false);
  state = E.submitPuzzle(content, state, state.activePuzzle?.correct ?? []);
  assert.equal(state.activePuzzle, null);
  assert.equal(state.nodes.wifi?.scanned, true);
  state = E.hypothesize(content, state, 'wifi', 'SL-02');
  assert.equal(state.activePuzzle?.archetype, 'brute');
  assert.equal(state.activePuzzle?.attemptsLeft, 6);
});
