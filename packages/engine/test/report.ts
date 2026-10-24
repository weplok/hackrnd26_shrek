import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as E from '../src/index.ts';
import type { Content, GameState } from '../src/index.ts';
import { loadContent } from './content.ts';

const content = loadContent();

function start(ct: Content = content): GameState {
  const difficulty = ct.campaign.levels[0]?.difficulty;
  if (!difficulty) throw new Error('missing level difficulty');
  return E.startCase(ct, E.createGame(ct, 'L1C1', difficulty, 777));
}

function solve(ct: Content, state: GameState): GameState {
  if (!state.activePuzzle) throw new Error('expected active puzzle');
  return E.submitPuzzle(ct, state, state.activePuzzle.correct);
}

function reachReport(ct: Content = content): GameState {
  let state = start(ct);
  state = solve(ct, E.scan(ct, state, 'wifi'));
  state = solve(ct, E.hypothesize(ct, state, 'wifi', 'SL-02'));
  assert.equal(state.phase, 'report');
  return state;
}

void test('report includes only found vulnerabilities and secures each fixed node', () => {
  const state = reachReport();
  assert.deepEqual(E.reportFindings(content, state).map((finding) => finding.id), ['f_wifi']);

  const report = E.buildCaseReport(content, state);
  assert.deepEqual(report.path, [{ nodeId: 'wifi', vulnerabilityId: 'SL-02', stage: 'credential_access' }]);
  assert.equal(report.scopeViolated, false);

  const fixed = E.apply(content, state, { type: 'AnswerReport', finding: 'f_wifi', option: 'o_pass' });
  assert.deepEqual(
    fixed.events.map((event) => event.type),
    ['ReportAnswered', 'NodeSecured', 'ObjectiveCompleted', 'CaseWon'],
  );
  assert.equal(fixed.state.nodes.wifi?.secured, true);
  assert.equal(fixed.state.phase, 'won');
  assert.equal(E.answerReport(content, fixed.state, 'f_router', 'o_admin').report.f_router, undefined);
});

void test('a successful vulnerability unlocks its Codex card without a content effect', () => {
  const ct = structuredClone(content);
  const wifi = ct.cases.L1C1?.nodes.find((node) => node.id === 'wifi');
  if (!wifi) throw new Error('missing wifi node');
  wifi.onCompromise = wifi.onCompromise.filter((effect) => !('unlockCodex' in effect));

  assert.equal(reachReport(ct).codex['SL-02'], true);
});

void test('rank uses peak alarm and profile uses successful actions', () => {
  const state = start();
  state.maxAlarm = 30;
  state.tracks.alarm = 0;
  assert.notEqual(E.computeRank(content, state), 'Призрак');
  state.flags.scope_violated = true;
  assert.equal(E.computeRank(content, state), 'Специалист');
  state.flags.scope_violated = false;

  state.technicalSuccesses = 3;
  state.socialSuccesses = 2;
  assert.equal(E.profileStyle(state), 'технарь');
  state.technicalSuccesses = 2;
  state.socialSuccesses = 2;
  assert.equal(E.profileStyle(state), 'универсал');
  state.technicalSuccesses = 1;
  state.socialSuccesses = 2;
  assert.equal(E.profileStyle(state), 'переговорщик');
});
