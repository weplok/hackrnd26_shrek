// Headless playthrough: proves L1C1 and L2C1 are completable through the engine.
// Run from repo root: node --experimental-strip-types packages/engine/test/playthrough.ts
import { loadContent } from './content.ts';
import * as E from '../src/index.ts';
import type { Difficulty, GameState } from '../src/index.ts';

const content = loadContent();
let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.log('  x FAIL:', msg);
    failures++;
  }
}
function difficulty(level: number): Difficulty {
  const d = content.campaign.levels[level]?.difficulty;
  if (!d) throw new Error(`no level ${String(level)}`);
  return d;
}
function solve(s: GameState): GameState {
  if (!s.activePuzzle) throw new Error('no active puzzle');
  return E.submitPuzzle(content, s, s.activePuzzle.correct);
}
function scan(s: GameState, node: string): GameState {
  return solve(E.scan(content, s, node));
}

console.log('L1C1:');
{
  let s = E.createGame(content, 'L1C1', difficulty(0), 777);
  s = E.startCase(content, s);
  s = scan(s, 'wifi');
  s = scan(s, 'speaker');
  s = E.hypothesize(content, s, 'wifi', 'SL-02');
  s = solve(s);
  assert(s.phase === 'report', 'report phase reached');
  s = E.answerReport(content, s, 'f_wifi', 'o_pass');
  s = E.answerReport(content, s, 'f_router', 'o_admin');
  assert(s.phase === 'won', 'L1C1 WON');
  console.log(`  phase=${s.phase} rank=${String(s.rank)} ticks=${String(s.tick)} maxAlarm=${String(s.maxAlarm)}`);
}

console.log('L1C1 alt (SL-01 via router):');
{
  let s = E.createGame(content, 'L1C1', difficulty(0), 777);
  s = E.startCase(content, s);
  s = scan(s, 'wifi');
  s = scan(s, 'speaker');
  s = scan(s, 'router');
  s = E.hypothesize(content, s, 'router', 'SL-01');
  s = solve(s);
  assert(s.nodes.wifi?.compromised === true, 'wifi taken through router');
  assert(s.phase === 'report', 'report phase reached via router');
  s = E.answerReport(content, s, 'f_wifi', 'o_pass');
  s = E.answerReport(content, s, 'f_router', 'o_admin');
  assert(s.phase === 'won', 'L1C1 alt WON');
  console.log(`  phase=${s.phase} rank=${String(s.rank)} ticks=${String(s.tick)} maxAlarm=${String(s.maxAlarm)}`);
}

console.log('L2C1:');
{
  let s = E.createGame(content, 'L2C1', difficulty(1), 4242);
  s = E.startCase(content, s);
  s = scan(s, 'guest_wifi');
  s = E.hypothesize(content, s, 'guest_wifi', 'SL-02');
  s = solve(s);
  s = scan(s, 'mail');
  s = E.hypothesize(content, s, 'mail', 'SL-05');
  s = solve(s);
  s = E.combine(content, s, ['mail_format', 'dept_list']);
  s = E.present(content, s, 'kostya', 'friendly', []);
  s = scan(s, 'teacher_pc');
  s = E.hypothesize(content, s, 'teacher_pc', 'SL-07');
  s = solve(s);
  s = scan(s, 'gateway');
  s = E.hypothesize(content, s, 'gateway', 'SL-08');
  s = solve(s);
  s = E.present(content, s, 'anton', 'flattery', []);
  s = scan(s, 'controller');
  s = E.hypothesize(content, s, 'controller', 'SL-06');
  s = solve(s);
  s = E.combine(content, s, ['controller_token', 'anton_vouch']);
  s = E.present(content, s, 'marina', 'friendly', []);
  s = E.combine(content, s, ['marina_phrase', 'legend_it']);
  s = E.fillSocket(content, s, 'base_dean', 'sock_tech');
  s = E.fillSocket(content, s, 'base_dean', 'sock_human');
  assert(s.phase === 'report', 'report phase reached');
  for (const f of content.cases.L2C1?.report.findings ?? []) {
    const correct = f.options.find((o) => o.correct);
    if (correct) s = E.answerReport(content, s, f.id, correct.id);
  }
  assert(s.phase === 'won', 'L2C1 WON');
  console.log(
    `  phase=${s.phase} rank=${String(s.rank)} ticks=${String(s.tick)} maxAlarm=${String(s.maxAlarm)} codex=${String(Object.keys(s.codex).length)}`,
  );
}

console.log(failures === 0 ? '\nALL PLAYTHROUGHS PASSED' : `\n${String(failures)} FAILED`);
process.exit(failures === 0 ? 0 : 1);
