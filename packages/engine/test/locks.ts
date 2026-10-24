// Double lock, segments/gateway, key assembly and pivoting (T-B6).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as E from '../src/index.ts';
import type { Content, GameEvent, GameState } from '../src/index.ts';
import { loadContent } from './content.ts';

const content = loadContent();
const types = (ev: GameEvent[]) => ev.map((e) => e.type);

function start(ct: Content = content): GameState {
  const d = ct.campaign.levels[1]?.difficulty;
  if (!d) throw new Error('no level 1');
  return E.startCase(ct, E.createGame(ct, 'L2C1', d, 4242));
}
function solve(s: GameState, ct: Content = content): GameState {
  if (!s.activePuzzle) throw new Error('no active puzzle');
  return E.submitPuzzle(ct, s, s.activePuzzle.correct);
}
function take(s: GameState, node: string, vuln: string, ct: Content = content): GameState {
  s = solve(E.scan(ct, s, node), ct);
  return solve(E.hypothesize(ct, s, node, vuln), ct);
}
function withNode(patch: (c: Content) => void): Content {
  const ct = structuredClone(content);
  patch(ct);
  return ct;
}

// Up to the moment both halves of the base_dean lock are assembled from clues.
function beforeKeys(): GameState {
  let s = start();
  s = take(s, 'guest_wifi', 'SL-02');
  s = take(s, 'mail', 'SL-05');
  s = E.combine(content, s, ['mail_format', 'dept_list']);
  s = E.present(content, s, 'kostya', 'friendly', []);
  s = take(s, 'teacher_pc', 'SL-07');
  s = take(s, 'gateway', 'SL-08');
  s = E.present(content, s, 'anton', 'flattery', []);
  s = take(s, 'controller', 'SL-06');
  return E.present(content, s, 'marina', 'friendly', []);
}

void test('nodes of a closed segment are dim; the gateway node stays actionable', () => {
  const ct = withNode((c) => {
    const anton = c.cases.L2C1?.nodes.find((n) => n.id === 'anton');
    if (anton) delete anton.revealedBy;
  });
  let s = start(ct);
  assert.deepEqual(E.apply(ct, s, { type: 'ScanNode', node: 'anton' }).events, [
    { type: 'CommandRejected', reason: 'node-dim' },
  ]);
  s = solve(E.scan(ct, s, 'guest_wifi'), ct);
  s = solve(E.scan(ct, s, 'teacher_pc'), ct);
  assert.equal(s.segmentsOpen.admin, false);
  assert.deepEqual(E.apply(ct, s, { type: 'ScanNode', node: 'gateway' }).events, [
    { type: 'ScanOpened', node: 'gateway' },
  ]);
});

void test('passing the gateway opens the segment', () => {
  let s = start();
  s = take(s, 'guest_wifi', 'SL-02');
  s = take(s, 'teacher_pc', 'SL-07');
  s = solve(E.scan(content, s, 'gateway'));
  const opened = E.apply(content, s, { type: 'ProposeHypothesis', node: 'gateway', vuln: 'SL-08' });
  const r = E.apply(content, opened.state, { type: 'SubmitPuzzle', answer: opened.state.activePuzzle?.correct ?? [] });
  assert.ok(r.events.some((e) => e.type === 'SegmentOpened' && e.segment === 'admin'));
  assert.equal(r.state.nodes.anton?.revealed, true);
});

void test('compromising a node reveals its linked neighbours', () => {
  const ct = withNode((c) => {
    const printer = c.cases.L2C1?.nodes.find((n) => n.id === 'printer');
    if (printer) printer.revealedBy = { flag: 'never' };
  });
  let s = start(ct);
  s = take(s, 'guest_wifi', 'SL-02', ct);
  s = solve(E.scan(ct, s, 'teacher_pc'), ct);
  assert.equal(s.nodes.printer?.revealed, false);
  const opened = E.apply(ct, s, { type: 'ProposeHypothesis', node: 'teacher_pc', vuln: 'SL-07' });
  const r = E.apply(ct, opened.state, { type: 'SubmitPuzzle', answer: opened.state.activePuzzle?.correct ?? [] });
  assert.equal(r.state.nodes.printer?.revealed, true);
  assert.ok(r.events.some((e) => e.type === 'NodesRevealed' && e.nodes.includes('printer')));
});

void test('combining clues assembles a key by recipe; a wrong pair does not stick', () => {
  const s = beforeKeys();
  const bad = E.apply(content, s, { type: 'CombineClues', a: 'controller_token', b: 'marina_phrase' });
  assert.deepEqual(types(bad.events), ['CombineFailed']);
  assert.equal(bad.state.tracks.alarm, s.tracks.alarm);
  const ok = E.apply(content, s, { type: 'CombineClues', a: 'anton_vouch', b: 'controller_token' });
  assert.deepEqual(ok.events[0], { type: 'KeyAssembled', key: 'deanbase_tech' });
  assert.equal(ok.state.keys.deanbase_tech, true);
});

void test('double lock opens only when every socket is filled', () => {
  let s = beforeKeys();
  s = E.apply(content, s, { type: 'CombineClues', a: 'controller_token', b: 'anton_vouch' }).state;

  const wrong = E.apply(content, s, { type: 'FillSocket', node: 'base_dean', socket: 'sock_tech', key: 'legend_it' });
  assert.equal(wrong.events[0]?.type, 'SocketRejected');
  assert.ok((wrong.state.noise.base_dean ?? 0) > 0);
  assert.equal(wrong.state.sockets.base_dean?.sock_tech, false);

  const missing = E.apply(content, s, {
    type: 'FillSocket',
    node: 'base_dean',
    socket: 'sock_human',
    key: 'deanbase_human',
  });
  assert.equal(missing.events[0]?.type, 'SocketRejected');

  const tech = E.apply(content, s, {
    type: 'FillSocket',
    node: 'base_dean',
    socket: 'sock_tech',
    key: 'deanbase_tech',
  });
  assert.deepEqual(tech.events[0], { type: 'SocketFilled', node: 'base_dean', socket: 'sock_tech' });
  assert.ok(!types(tech.events).includes('LockOpened'));
  assert.equal(tech.state.nodes.base_dean?.compromised, false);
  assert.deepEqual(
    E.apply(content, tech.state, { type: 'FillSocket', node: 'base_dean', socket: 'sock_tech', key: 'deanbase_tech' })
      .events,
    [{ type: 'CommandRejected', reason: 'socket-filled' }],
  );

  s = E.apply(content, tech.state, { type: 'CombineClues', a: 'marina_phrase', b: 'legend_it' }).state;
  const human = E.apply(content, s, {
    type: 'FillSocket',
    node: 'base_dean',
    socket: 'sock_human',
    key: 'deanbase_human',
  });
  assert.deepEqual(types(human.events).slice(0, 2), ['SocketFilled', 'LockOpened']);
  assert.equal(human.state.nodes.base_dean?.compromised, true);
  assert.equal(human.state.phase, 'report');
});
