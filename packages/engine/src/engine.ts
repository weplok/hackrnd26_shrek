// ZERO DAY engine core: command handlers over GameState. Content-driven.
import type { Content, GameState, Case, CaseReport, ContentNode, PuzzleInstance, Difficulty, NodeRuntime } from './types.ts';
import { evalCondition } from './conditions.ts';
import { applyEffects, clamp } from './effects.ts';
import { generatePuzzle, checkPuzzle, puzzleLogic, DEFAULT_FAIL_HINT } from './puzzles/index.ts';
import { resolveNpcTurn } from './npc.ts';
import { nextInt } from './rng.ts';

const NOISE: Record<string, number> = { quiet: 4, moderate: 9, loud: 16 };
export { DEFAULT_FAIL_HINT };

/** Content failHint for the guessed vuln, else the archetype's own explanation. */
export function failHint(n: ContentNode | undefined, inst: PuzzleInstance): string {
  return n?.failHints[inst.vuln] ?? puzzleLogic(inst.archetype).explainMismatch(inst);
}

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
// FR-090: only the first action on an out-of-scope node asks; a confirmed node stays open.
export function needsScopeConfirm(s: GameState, n: ContentNode): boolean {
  return !n.inScope && !s.flags[`scope_ok:${n.id}`];
}
function targetNode(c: Case): ContentNode | undefined {
  return c.nodes.find((n) => n.kind === 'target');
}

export function createGame(content: Content, caseId: string, difficulty: Difficulty, seed = 12345): GameState {
  const c = content.cases[caseId];
  if (!c) throw new Error(`unknown case ${caseId}`);
  const nodes: GameState['nodes'] = {};
  for (const n of c.nodes) {
    nodes[n.id] = {
      segment: n.segment,
      revealed: !n.revealedBy,
      scanned: false,
      compromised: false,
      secured: false,
      alertLevel: 'calm',
    };
  }
  const segmentsOpen: Record<string, boolean> = {};
  for (const seg of c.segments) segmentsOpen[seg.id] = seg.openAtStart;
  const tracks: Record<string, number> = {};
  for (const t of c.tracks) tracks[t.id] = t.start;
  const npc: GameState['npc'] = {};
  for (const id of c.npcs) {
    const cfg = content.npcs[id];
    npc[id] = { suspicion: cfg?.suspicion.start ?? 10, locked: false, yielded: false, revealedFacts: {} };
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
    technicalSuccesses: 0,
    socialSuccesses: 0,
    successfulVulnerabilities: [],
    nodes,
    segmentsOpen,
    clues: {},
    keys: {},
    flags: {},
    tracks,
    maxAlarm: 0,
    noise: {},
    checkpointsReached: {},
    checkpoint: null,
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

// FR-070 thresholds 30/60/85 drive the alarm colour and Flipper pose.
export type AlarmLevel = 'calm' | 'alert' | 'growl' | 'bark';
export function alarmLevel(alarm: number): AlarmLevel {
  if (alarm >= 85) return 'bark';
  if (alarm >= 60) return 'growl';
  if (alarm >= 30) return 'alert';
  return 'calm';
}

// source = node id that made the noise; feeds the caught debrief (FR-071).
function stepAlarm(s: GameState, rawAdd: number, source: string): void {
  const d = s.difficulty;
  const add = Math.max(0, rawAdd) * d.noiseMultiplier;
  if (add > 0) s.noise[source] = (s.noise[source] ?? 0) + add;
  s.tracks.alarm = clamp((s.tracks.alarm ?? 0) + add - d.alarmDecayPerTick);
  s.tick += 1;
  caughtCheck(s);
}

function caughtCheck(s: GameState): void {
  const alarm = s.tracks.alarm ?? 0;
  s.maxAlarm = Math.max(s.maxAlarm, alarm);
  if (alarm >= 100 && s.phase === 'playing') {
    s.phase = 'caught';
    s.activePuzzle = null;
    s.activeChat = null;
    s.pendingScope = null;
    s.log.push({ t: '!! Тревога 100% — тебя вычислили.', kind: 'bad' });
  }
}

/** Noise sources since the last checkpoint, loudest first. */
export function noiseSources(s: GameState): { source: string; noise: number }[] {
  return Object.entries(s.noise)
    .map(([source, noise]) => ({ source, noise: Math.round(noise) }))
    .sort((a, b) => b.noise - a.noise);
}

// Checkpoint = start of the current case step (Q-7): snapshot when its condition first holds.
function checkpoints(c: Case, s: GameState): void {
  if (s.phase !== 'briefing' && s.phase !== 'playing') return;
  for (const cp of c.checkpoints) {
    if (s.checkpointsReached[cp.id] || !evalCondition(cp.when, s)) continue;
    s.checkpointsReached[cp.id] = true;
    s.noise = {};
    s.checkpoint = { id: cp.id, state: structuredClone({ ...s, checkpoint: null }) };
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
  caughtCheck(s);
  checkpoints(c, s);
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
  // Pivoting: a taken node exposes its links; neighbours of a closed segment stay dim (FR-024).
  for (const e of getCase(content, s).edges) {
    const other = e.from === n.id ? e.to : e.to === n.id ? e.from : null;
    const rt = other ? s.nodes[other] : undefined;
    if (rt) rt.revealed = true;
  }
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
  if (s.phase !== 'playing' || s.activePuzzle) return s;
  const c = getCase(content, s);
  const n = node(c, nodeId);
  if (!n || !nodeRt(s, nodeId).revealed) return s;
  if (needsScopeConfirm(s, n)) {
    s.pendingScope = nodeId;
    return s;
  }
  if (nodeRt(s, nodeId).scanned) {
    // FR-030: repeat scan yields nothing new but still makes noise
    nodeRt(s, nodeId).alertLevel = 'detected';
    s.log.push({ t: `[scan] ${n.label}: нового нет, только шум.`, kind: 'bad' });
    stepAlarm(s, n.scanNoise, nodeId);
    recompute(content, s);
    return s;
  }
  const knobs = s.difficulty.puzzleKnobs.scan ?? {};
  let inst: PuzzleInstance;
  [s.rng, inst] = generatePuzzle(
    s.rng,
    'scan',
    'Радар-эхо',
    { target: n.label, ports: n.exploits.length > 0 ? ['эхо: 443/tcp', 'эхо: 53/udp'] : ['эхо: 53/udp'] },
    knobs,
    nodeId,
    'scan',
    { genuine: true, label: (id) => node(c, id)?.label ?? id },
    'scan',
  );
  s.activePuzzle = inst;
  s.log.push({ t: `[scan] ${n.label}: импульс отправлен.`, kind: 'cmd' });
  return s;
}

function completeScan(content: Content, s: GameState, nodeId: string): void {
  const c = getCase(content, s);
  const n = node(c, nodeId);
  if (!n || nodeRt(s, nodeId).scanned) return;
  nodeRt(s, nodeId).scanned = true;
  nodeRt(s, nodeId).alertLevel = 'alerted';
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
  if (sl) {
    const name = content.vulnerabilities[sl]?.title ?? sl;
    s.log.push({ t: `[scan] ${n.label}: слабость — ${name} (${sl}).`, kind: 'sys' });
  }
  stepAlarm(s, n.scanNoise, nodeId);
  recompute(content, s);
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
  if (needsScopeConfirm(s, n)) {
    s.pendingScope = nodeId;
    return s;
  }
  if (n.kind === 'person' || n.lock) return s;
  const arch = content.puzzles[vuln]?.archetype ?? 'default';
  const title = content.puzzles[vuln]?.title ?? vuln;
  const ex = n.exploits.find((e) => e.vuln === vuln);
  let inst: PuzzleInstance;
  // TZ 7.5: level knobs for the archetype, overridden by the node's exploit knobs
  const knobs = { ...s.difficulty.puzzleKnobs[arch], ...ex?.knobs };
  [s.rng, inst] = generatePuzzle(s.rng, arch, title, ex?.puzzleParams ?? {}, knobs, nodeId, vuln, {
    genuine: !!ex,
    label: (id) => node(c, id)?.label ?? id,
  });
  s.activePuzzle = inst;
  s.log.push({ t: `$ гипотеза: ${n.label} → ${vuln}`, kind: 'cmd' });
  return s;
}

export function cancelPuzzle(content: Content, state: GameState): GameState {
  const s = clone(state);
  const inst = s.activePuzzle;
  s.activePuzzle = null;
  // scan has no attempt limit, so walking away is its only way to fail
  if (inst?.archetype === 'scan' && s.phase === 'playing') {
    const label = node(getCase(content, s), inst.nodeId)?.label ?? inst.nodeId;
    nodeRt(s, inst.nodeId).alertLevel = 'detected';
    s.log.push({ t: `✗ ${label}: скан брошен, узел насторожился.`, kind: 'bad' });
    stepAlarm(s, s.difficulty.wrongGuessNoise, inst.nodeId);
  }
  return s;
}

export function submitPuzzle(content: Content, state: GameState, selected: string[]): GameState {
  const s = clone(state);
  const inst = s.activePuzzle;
  if (!inst || s.phase !== 'playing') return s;
  const c = getCase(content, s);
  const n = node(c, inst.nodeId);
  if (!n) return s;
  const methodTitle = content.vulnerabilities[inst.vuln]?.title ?? inst.vuln;
  const result = checkPuzzle(inst, selected);
  if (!result.solved && inst.archetype === 'scan') {
    s.log.push({ t: `✗ ${puzzleLogic(inst.archetype).explainMismatch(inst)}`, kind: 'bad' });
    return s;
  }
  if (!result.solved) {
    const left = inst.attemptsLeft - 1;
    s.activePuzzle = left > 0 ? { ...inst, attemptsLeft: left } : null;
    s.log.push({
      t:
        left > 0
          ? `✗ приём «${methodTitle}» к узлу ${n.label} не вышел, попыток осталось: ${String(left)}.`
          : `✗ приём «${methodTitle}» к узлу ${n.label}: не удалось.`,
      kind: 'bad',
    });
    nodeRt(s, n.id).alertLevel = 'detected';
    stepAlarm(s, s.difficulty.wrongGuessNoise * puzzleLogic(inst.archetype).noise(result, inst.knobs), n.id);
    return s;
  }
  s.activePuzzle = null;
  if (inst.action === 'scan') {
    completeScan(content, s, inst.nodeId);
    return s;
  }
  const ex = n.exploits.find((e) => e.vuln === inst.vuln);
  const reqOk = ex ? evalCondition(ex.requires, s) : false;
  if (ex && reqOk) {
    s.log.push({ t: `✓ приём «${methodTitle}» к узлу ${n.label}: успешно.`, kind: 'ok' });
    const vulnInfo = content.vulnerabilities[inst.vuln];
    const noise = NOISE[vulnInfo?.noiseProfile ?? 'moderate'] ?? 9;
    if (!s.successfulVulnerabilities.includes(inst.vuln)) s.successfulVulnerabilities.push(inst.vuln);
    s.technicalSuccesses += 1;
    const card = vulnInfo?.codexCardId;
    if (card) s.codex[card] = true;
    applyEffects(ex.effects, s, compromiser(content, s));
    compromise(content, s, n);
    stepAlarm(s, noise, n.id);
  } else {
    nodeRt(s, n.id).alertLevel = 'detected';
    const hint = failHint(n, inst);
    s.log.push({ t: `✗ приём «${methodTitle}» к узлу ${n.label}: не сработал, не та слабость. ${hint}`, kind: 'bad' });
    stepAlarm(s, s.difficulty.wrongGuessNoise, n.id);
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

// keyId omitted = use the key the socket accepts; a wrong or missing key makes noise.
export function fillSocket(
  content: Content,
  state: GameState,
  nodeId: string,
  socketId: string,
  keyId?: string,
): GameState {
  const s = clone(state);
  if (s.phase !== 'playing') return s;
  const c = getCase(content, s);
  const n = node(c, nodeId);
  if (!n || !n.lock || !nodeRt(s, nodeId).revealed) return s;
  const sock = n.lock.sockets.find((x) => x.id === socketId);
  if (!sock) return s;
  const accepted = sock.accepts.replace(/^key:/, '');
  const key = keyId ?? accepted;
  if (key !== accepted || !s.keys[key]) {
    s.log.push({ t: `Ключ не подходит к гнезду «${sock.label}».`, kind: 'bad' });
    stepAlarm(s, 3, nodeId);
    recompute(content, s);
    return s;
  }
  s.sockets[nodeId] = { ...s.sockets[nodeId], [socketId]: true };
  s.log.push({ t: `гнездо заполнено: ${sock.label}`, kind: 'ok' });
  stepAlarm(s, 3, nodeId);
  recompute(content, s);
  return s;
}

export function openChat(content: Content, state: GameState, npcId: string): GameState {
  const s = clone(state);
  const c = getCase(content, s);
  const n = c.nodes.find((x) => x.npc === npcId);
  if (n && needsScopeConfirm(s, n)) {
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
    s.socialSuccesses += 1;
    for (const fact of out.grant) rt.revealedFacts[fact] = true;
    compromise(content, s, pnode); // node.onCompromise grants the held clue
  }
  if (rt.suspicion >= cfg.suspicion.fail_at) {
    rt.locked = true;
    s.log.push({ t: `${cfg.role} закрылся — путь через него потерян.`, kind: 'bad' });
    stepAlarm(s, 15, pnode.id);
  } else {
    stepAlarm(s, out.suspicionDelta > 0 ? out.suspicionDelta * 0.5 : 2, pnode.id);
  }
  recompute(content, s);
  return s;
}

/** Applies the final verdict of an LLM social-engineering chat with a person node. */
export function socialOutcome(
  content: Content,
  state: GameState,
  nodeId: string,
  verdict: 'ended' | 'noticed' | 'complete',
): GameState {
  const s = clone(state);
  if (s.phase !== 'playing') return s;
  const n = node(getCase(content, s), nodeId);
  if (!n) return s;
  s.socialActions += 1;
  if (verdict === 'complete') {
    s.socialSuccesses += 1;
    compromise(content, s, n);
  } else if (verdict === 'noticed') {
    s.log.push({ t: `!! ${n.label} сообщил в службу безопасности.`, kind: 'bad' });
    s.noise[n.id] = (s.noise[n.id] ?? 0) + 30;
    s.tracks.alarm = clamp((s.tracks.alarm ?? 0) + 30);
  } else {
    s.log.push({ t: `${n.label} прервал диалог.`, kind: 'bad' });
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
    s.flags[`scope_ok:${nodeId}`] = true;
    s.log.push({ t: '!! Выход за рамки договора. Заказчик это увидит.', kind: 'bad' });
    stepAlarm(s, 30, nodeId);
  } else {
    s.log.push({ t: 'Отступил. Остаёмся в рамках договора.', kind: 'ok' });
  }
  recompute(content, s);
  return s;
}

export function cleanLogs(content: Content, state: GameState): GameState {
  const s = clone(state);
  if (s.phase !== 'playing') return s;
  let roll: number;
  [s.rng, roll] = nextInt(s.rng);
  const alarmDelta = roll % 2 === 0 ? 5 : -10;
  s.tracks.alarm = clamp((s.tracks.alarm ?? 0) + alarmDelta);
  s.tick += 1;
  s.log.push({ t: `[логи] ${alarmDelta > 0 ? 'очистка замечена, тревога +5.' : 'следы стёрты, тревога -10.'}`, kind: 'sys' });
  caughtCheck(s);
  return s;
}

// FR-071: back to the start of the current step; Codex cards, tick and RNG keep moving forward.
export function restoreCheckpoint(content: Content, state: GameState): GameState {
  const cp = state.checkpoint;
  if (state.phase !== 'caught' || !cp) return clone(state);
  const label = getCase(content, state).checkpoints.find((x) => x.id === cp.id)?.label ?? cp.id;
  const s = structuredClone(cp.state);
  s.phase = 'playing';
  s.tick = state.tick;
  s.rng = state.rng;
  s.maxAlarm = state.maxAlarm;
  s.codex = { ...s.codex, ...state.codex };
  // FR-092: a violation survives a rollback; only a replay of the case is clean.
  if (state.flags.scope_violated) s.flags.scope_violated = true;
  s.checkpoint = structuredClone(cp);
  s.log = [...state.log, { t: `<< откат к чекпоинту: ${label}`, kind: 'sys' }];
  return s;
}

export function answerReport(content: Content, state: GameState, findingId: string, optionId: string): GameState {
  const s = clone(state);
  if (s.phase !== 'report') return s;
  const finding = reportFindings(content, s).find((f) => f.id === findingId);
  if (!finding) return s;
  const opt = finding.options.find((o) => o.id === optionId);
  s.report[findingId] = !!opt?.correct;
  if (opt?.correct) nodeRt(s, finding.node).secured = true;
  const allCorrect = reportFindings(content, s).every((f) => s.report[f.id] === true);
  if (allCorrect) finalizeWin(content, s);
  return s;
}

export function reportFindings(content: Content, state: GameState): Case['report']['findings'] {
  return getCase(content, state).report.findings.filter((finding) => state.nodes[finding.node]?.compromised);
}

export function buildCaseReport(content: Content, state: GameState): CaseReport {
  return {
    caseId: state.caseId,
    path: state.successfulVulnerabilities.flatMap((vulnerabilityId) => {
      const vulnerability = content.vulnerabilities[vulnerabilityId];
      const nodeId = getCase(content, state).nodes.find((node) =>
        node.exploits.some((exploit) => exploit.vuln === vulnerabilityId),
      )?.id;
      return vulnerability && nodeId
        ? [{ nodeId, vulnerabilityId, stage: vulnerability.killChainStage }]
        : [];
    }),
    findings: reportFindings(content, state),
    scopeViolated: !!state.flags.scope_violated,
  };
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
  if (s.flags.scope_violated) return c.ranks[c.ranks.length - 1]?.title ?? '—';
  for (const r of c.ranks) {
    if (!r.when || evalCondition(r.when, s)) return r.title;
  }
  return c.ranks[c.ranks.length - 1]?.title ?? '—';
}

export function profileStyle(s: GameState): 'технарь' | 'переговорщик' | 'универсал' {
  const t = s.technicalSuccesses,
    soc = s.socialSuccesses,
    total = t + soc;
  if (total === 0) return 'универсал';
  if (t / total >= 0.6) return 'технарь';
  if (soc / total >= 0.6) return 'переговорщик';
  return 'универсал';
}
