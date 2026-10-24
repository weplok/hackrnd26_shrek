// ZERO DAY engine core: command handlers over GameState. Content-driven.
import type { Content, GameState, Case, ContentNode, PuzzleInstance, Difficulty, NodeRuntime } from './types.ts';
import { evalCondition } from './conditions.ts';
import { applyEffects, clamp } from './effects.ts';
import { generatePuzzle, verifyPuzzle } from './puzzles.ts';
import { resolveNpcTurn } from './npc.ts';

const NOISE: Record<string, number> = { quiet: 4, moderate: 9, loud: 16 };
export const DEFAULT_FAIL_HINT = 'Узел не поддался: приём не подошёл.';

function getCase(content: Content, s: GameState): Case {
  const c = content.cases[s.caseId];
  if (!c) throw new Error(`unknown case ${s.caseId}`);
  return c;
}
function node(c: Case, id: string): ContentNode | undefined {
  return c.nodes.find((n) => n.id === id);
}
function nodeRt(s: GameState, id: string): NodeRuntime {
  const rt = s.nodes[id];
  if (!rt) throw new Error(`unknown node ${id}`);
  return rt;
}
function targetNode(c: Case): ContentNode | undefined {
  return c.nodes.find((n) => n.kind === 'target');
}

export function createGame(content: Content, caseId: string, difficulty: Difficulty, seed = 12345): GameState {
  const c = content.cases[caseId];
  if (!c) throw new Error(`unknown case ${caseId}`);
  const nodes: GameState['nodes'] = {};
  for (const n of c.nodes) {
    nodes[n.id] = { revealed: !n.revealedBy, scanned: false, compromised: false, secured: false };
  }
  const segmentsOpen: Record<string, boolean> = {};
  for (const seg of c.segments) segmentsOpen[seg.id] = seg.openAtStart;
  const tracks: Record<string, number> = {};
  for (const t of c.tracks) tracks[t.id] = t.start;
  const npc: GameState['npc'] = {};
  for (const id of c.npcs) {
    const cfg = content.npcs[id];
    npc[id] = { suspicion: cfg?.suspicion.start ?? 10, locked: false, yielded: false };
  }
  const sockets: GameState['sockets'] = {};
  for (const n of c.nodes) {
    if (n.lock) {
      const socks: Record<string, boolean> = {};
      for (const sock of n.lock.sockets) socks[sock.id] = false;
      sockets[n.id] = socks;
    }
  }
  const s: GameState = {
    caseId,
    phase: 'briefing',
    tick: 0,
    scans: 0,
    socialActions: 0,
    techActions: 0,
    nodes,
    segmentsOpen,
    clues: {},
    keys: {},
    flags: {},
    tracks,
    maxAlarm: 0,
    codex: {},
    npc,
    sockets,
    objectives: {},
    report: {},
    rng: seed >>> 0,
    activePuzzle: null,
    activeChat: null,
    pendingScope: null,
    rank: null,
    log: [{ t: `// контракт: ${c.title}`, kind: 'sys' }],
    difficulty,
  };
  recompute(content, s);
  return s;
}

function clone(s: GameState): GameState {
  return structuredClone(s);
}

function stepAlarm(s: GameState, rawAdd: number): void {
  const d = s.difficulty;
  const add = Math.max(0, rawAdd) * d.noiseMultiplier;
  const next = clamp((s.tracks.alarm ?? 0) + add - d.alarmDecayPerTick);
  s.tracks.alarm = next;
  s.maxAlarm = Math.max(s.maxAlarm, next);
  s.tick += 1;
  if (next >= 100 && s.phase === 'playing') {
    s.phase = 'caught';
    s.log.push({ t: '!! Тревога 100% — тебя вычислили.', kind: 'bad' });
  }
}

export function recompute(content: Content, s: GameState): void {
  const c = getCase(content, s);
  // reveals (sticky)
  for (const n of c.nodes) {
    const rt = nodeRt(s, n.id);
    if (!rt.revealed && n.revealedBy && evalCondition(n.revealedBy, s)) rt.revealed = true;
    if (!n.revealedBy) rt.revealed = true;
  }
  // locks → compromise when all sockets filled
  for (const n of c.nodes) {
    if (n.lock && !nodeRt(s, n.id).compromised) {
      const socks = s.sockets[n.id];
      if (socks && Object.values(socks).every(Boolean)) compromise(content, s, n);
    }
  }
  // objectives (sticky)
  for (const o of c.objectives) {
    if (!s.objectives[o.id] && evalCondition(o.doneWhen, s)) s.objectives[o.id] = true;
  }
  // win → report phase
  const tgt = targetNode(c);
  if (tgt && nodeRt(s, tgt.id).compromised && s.phase === 'playing') {
    s.phase = 'report';
    s.log.push({ t: '>> Цель достигнута. Переходим к отчёту заказчику.', kind: 'ok' });
  }
}

function compromise(content: Content, s: GameState, n: ContentNode): void {
  if (nodeRt(s, n.id).compromised) return;
  nodeRt(s, n.id).compromised = true;
  s.log.push({ t: `✓ узел взят: ${n.label}`, kind: 'ok' });
  applyEffects(n.onCompromise, s, compromiser(content, s));
}

function compromiser(content: Content, s: GameState): (id: string) => void {
  return (id) => {
    const n = node(getCase(content, s), id);
    if (n) compromise(content, s, n);
  };
}

// ---------------- commands ----------------

export function startCase(content: Content, state: GameState): GameState {
  const s = clone(state);
  if (s.phase === 'briefing') s.phase = 'playing';
  return s;
}

export function scan(content: Content, state: GameState, nodeId: string): GameState {
  const s = clone(state);
  if (s.phase !== 'playing') return s;
  const c = getCase(content, s);
  const n = node(c, nodeId);
  if (!n || !nodeRt(s, nodeId).revealed) return s;
  if (!n.inScope) {
    s.pendingScope = nodeId;
    return s;
  }
  if (nodeRt(s, nodeId).scanned) {
    // FR-030: repeat scan yields nothing new but still makes noise
    s.log.push({ t: `[scan] ${n.label}: нового нет, только шум.`, kind: 'bad' });
    stepAlarm(s, n.scanNoise);
    recompute(content, s);
    return s;
  }
  nodeRt(s, nodeId).scanned = true;
  s.scans += 1;
  s.techActions += 1;
  // recon surfaces clues foundOn this node, except those granted on compromise
  const viaCompromise = compromiseClueSet(c);
  for (const clue of c.clues) {
    if (clue.foundOn === nodeId && !s.clues[clue.id] && !viaCompromise.has(clue.id)) {
      s.clues[clue.id] = true;
      s.log.push({ t: `улика: ${clue.text}`, kind: 'clue' });
    }
  }
  const sl = n.exploits[0]?.vuln;
  if (sl) s.log.push({ t: `[scan] ${n.label}: слабость ${sl}.`, kind: 'sys' });
  stepAlarm(s, n.scanNoise);
  recompute(content, s);
  return s;
}

// clue ids that any node grants via onCompromise (so they are not surfaced by scan)
function compromiseClueSet(c: Case): Set<string> {
  const set = new Set<string>();
  for (const n of c.nodes) {
    for (const eff of n.onCompromise) {
      if ('grantClues' in eff) for (const id of eff.grantClues) set.add(id);
    }
  }
  return set;
}

export function hypothesize(content: Content, state: GameState, nodeId: string, vuln: string): GameState {
  const s = clone(state);
  if (s.phase !== 'playing' || s.activePuzzle) return s;
  const c = getCase(content, s);
  const n = node(c, nodeId);
  if (!n || !nodeRt(s, nodeId).revealed) return s;
  if (!n.inScope) {
    s.pendingScope = nodeId;
    return s;
  }
  if (n.kind === 'person' || n.lock) return s;
  if (!nodeRt(s, nodeId).scanned) {
    s.log.push({ t: 'Сначала осмотри узел (скан).', kind: 'bad' });
    return s;
  }
  const arch = content.puzzles[vuln]?.archetype ?? 'default';
  const title = content.puzzles[vuln]?.title ?? vuln;
  const ex = n.exploits.find((e) => e.vuln === vuln);
  let inst: PuzzleInstance;
  [s.rng, inst] = generatePuzzle(s.rng, arch, title, ex?.puzzleParams ?? {}, ex?.knobs, nodeId, vuln);
  s.activePuzzle = inst;
  s.log.push({ t: `$ гипотеза: ${n.label} → ${vuln}`, kind: 'cmd' });
  return s;
}

export function cancelPuzzle(content: Content, state: GameState): GameState {
  const s = clone(state);
  s.activePuzzle = null;
  return s;
}

export function submitPuzzle(content: Content, state: GameState, selected: string[]): GameState {
  const s = clone(state);
  const inst = s.activePuzzle;
  if (!inst || s.phase !== 'playing') return s;
  const c = getCase(content, s);
  const n = node(c, inst.nodeId);
  if (!n) return s;
  const solved = verifyPuzzle(inst, selected);
  s.activePuzzle = null;
  if (!solved) {
    s.log.push({ t: '✗ головоломка не решена.', kind: 'bad' });
    stepAlarm(s, s.difficulty.wrongGuessNoise);
    return s;
  }
  const ex = n.exploits.find((e) => e.vuln === inst.vuln);
  const reqOk = ex ? evalCondition(ex.requires, s) : false;
  if (ex && reqOk) {
    const vulnInfo = content.vulnerabilities[inst.vuln];
    const noise = NOISE[vulnInfo?.noiseProfile ?? 'moderate'] ?? 9;
    applyEffects(ex.effects, s, compromiser(content, s));
    compromise(content, s, n);
    stepAlarm(s, noise);
  } else {
    const hint = n.failHints[inst.vuln] ?? DEFAULT_FAIL_HINT;
    s.log.push({ t: `✗ не та слабость. ${hint}`, kind: 'bad' });
    stepAlarm(s, s.difficulty.wrongGuessNoise);
  }
  recompute(content, s);
  return s;
}

export function combine(content: Content, state: GameState, selected: string[]): GameState {
  const s = clone(state);
  if (s.phase !== 'playing') return s;
  const c = getCase(content, s);
  const owns = (id: string) => !!s.clues[id] || !!s.keys[id];
  const sel = [...selected].sort().join('|');
  const recipe = c.keyRecipes.find((r) => [...r.inputs].sort().join('|') === sel);
  if (recipe && recipe.inputs.every(owns)) {
    if (!s.keys[recipe.output]) {
      s.keys[recipe.output] = true;
      s.techActions += 1;
      s.log.push({ t: `🔑 собран ключ: ${recipe.label}`, kind: 'key' });
    }
  } else {
    s.log.push({ t: '[доска] из этих улик ключ не складывается.', kind: 'bad' });
  }
  recompute(content, s);
  return s;
}

export function fillSocket(content: Content, state: GameState, nodeId: string, socketId: string): GameState {
  const s = clone(state);
  if (s.phase !== 'playing') return s;
  const c = getCase(content, s);
  const n = node(c, nodeId);
  if (!n || !n.lock || !nodeRt(s, nodeId).revealed) return s;
  const sock = n.lock.sockets.find((x) => x.id === socketId);
  if (!sock) return s;
  const keyId = sock.accepts.replace(/^key:/, '');
  if (!s.keys[keyId]) {
    s.log.push({ t: `Нет ключа для гнезда «${sock.label}».`, kind: 'bad' });
    return s;
  }
  s.sockets[nodeId] = { ...s.sockets[nodeId], [socketId]: true };
  s.log.push({ t: `гнездо заполнено: ${sock.label}`, kind: 'ok' });
  stepAlarm(s, 3);
  recompute(content, s);
  return s;
}

export function openChat(content: Content, state: GameState, npcId: string): GameState {
  const s = clone(state);
  const c = getCase(content, s);
  const n = c.nodes.find((x) => x.npc === npcId);
  if (n && !n.inScope) {
    s.pendingScope = n.id;
    return s;
  }
  s.activeChat = npcId;
  return s;
}
export function closeChat(content: Content, state: GameState): GameState {
  const s = clone(state);
  s.activeChat = null;
  return s;
}

export function present(
  content: Content,
  state: GameState,
  npcId: string,
  tone: string,
  selected: string[],
): GameState {
  const s = clone(state);
  if (s.phase !== 'playing') return s;
  const c = getCase(content, s);
  const cfg = content.npcs[npcId];
  const pnode = c.nodes.find((x) => x.npc === npcId);
  if (!cfg || !pnode) return s;
  const rt = s.npc[npcId];
  if (!rt) return s;
  if (rt.locked || rt.yielded) return s;
  const out = resolveNpcTurn(cfg, s, tone, selected);
  rt.suspicion = clamp(rt.suspicion + out.suspicionDelta, 0, cfg.suspicion.fail_at);
  s.socialActions += 1;
  s.log.push({ t: `[чат ${cfg.role}] ${cfg.replies[out.replyKey] ?? '…'}`, kind: out.grant.length ? 'ok' : 'sys' });
  if (out.grant.length) {
    rt.yielded = true;
    compromise(content, s, pnode); // node.onCompromise grants the held clue
  }
  if (rt.suspicion >= cfg.suspicion.fail_at) {
    rt.locked = true;
    s.log.push({ t: `${cfg.role} закрылся — путь через него потерян.`, kind: 'bad' });
    stepAlarm(s, 15);
  } else {
    stepAlarm(s, out.suspicionDelta > 0 ? out.suspicionDelta * 0.5 : 2);
  }
  recompute(content, s);
  return s;
}

export function confirmScope(content: Content, state: GameState, go: boolean): GameState {
  const s = clone(state);
  const nodeId = s.pendingScope;
  s.pendingScope = null;
  if (!nodeId) return s;
  if (go) {
    s.flags.scope_violated = true;
    s.log.push({ t: '!! Выход за рамки договора. Заказчик это увидит.', kind: 'bad' });
    stepAlarm(s, 30);
  } else {
    s.log.push({ t: 'Отступил. Остаёмся в рамках договора.', kind: 'ok' });
  }
  recompute(content, s);
  return s;
}

export function wait(content: Content, state: GameState): GameState {
  const s = clone(state);
  if (s.phase !== 'playing') return s;
  s.tracks.alarm = clamp((s.tracks.alarm ?? 0) - 14 - s.difficulty.alarmDecayPerTick);
  s.tick += 1;
  s.log.push({ t: '[жду] вслушиваюсь в эфир, тревога спадает.', kind: 'sys' });
  return s;
}

export function answerReport(content: Content, state: GameState, findingId: string, optionId: string): GameState {
  const s = clone(state);
  if (s.phase !== 'report') return s;
  const c = getCase(content, s);
  const finding = c.report.findings.find((f) => f.id === findingId);
  if (!finding) return s;
  const opt = finding.options.find((o) => o.id === optionId);
  s.report[findingId] = !!opt?.correct;
  const allCorrect = c.report.findings.every((f) => s.report[f.id] === true);
  if (allCorrect) finalizeWin(content, s);
  return s;
}

function finalizeWin(content: Content, s: GameState): void {
  const c = getCase(content, s);
  for (const n of c.nodes) if (nodeRt(s, n.id).compromised) nodeRt(s, n.id).secured = true;
  // objectives referencing "secured"
  for (const o of c.objectives) if (!s.objectives[o.id] && evalCondition(o.doneWhen, s)) s.objectives[o.id] = true;
  s.phase = 'won';
  s.rank = computeRank(content, s);
  s.log.push({ t: `>> Дыры закрыты, отчёт сдан. Ранг: ${s.rank}`, kind: 'ok' });
}

export function computeRank(content: Content, s: GameState): string {
  const c = getCase(content, s);
  for (const r of c.ranks) {
    if (!r.when || evalCondition(r.when, s)) return r.title;
  }
  return c.ranks[c.ranks.length - 1]?.title ?? '—';
}

export function profileStyle(s: GameState): 'технарь' | 'переговорщик' | 'универсал' {
  const t = s.techActions,
    soc = s.socialActions,
    total = t + soc;
  if (total === 0) return 'универсал';
  if (Math.abs(t - soc) <= Math.max(2, total * 0.25)) return 'универсал';
  return t > soc ? 'технарь' : 'переговорщик';
}
