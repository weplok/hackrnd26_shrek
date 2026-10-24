import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv } from 'ajv';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const contentDir = join(root, 'content');
const schemasDir = join(contentDir, 'schemas');

/** @type {string[]} */
const errors = [];
/** @param {string} file @param {string} msg */
const fail = (file, msg) => errors.push(`${relative(root, file)}: ${msg}`);

/** @param {string} dir @returns {Promise<string[]>} */
async function jsonFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await jsonFiles(p)));
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out.sort();
}

/** @param {string} file @returns {Promise<any>} */
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

/** @param {string} file @returns {string | null} */
function schemaFor(file) {
  const rel = relative(contentDir, file).replaceAll('\\', '/');
  if (rel.startsWith('cases/')) return 'case';
  if (rel.startsWith('catalog/codex/')) return 'codex-card';
  if (rel === 'catalog/puzzles.json') return 'puzzles';
  if (rel === 'catalog/vulnerabilities.json') return 'vulnerabilities';
  if (['campaign.json', 'flipper.json', 'consequences.json', 'interludes.json'].includes(rel)) {
    return rel.replace('.json', '');
  }
  return null;
}

// 1. Schema
const ajv = new Ajv({ allErrors: true, strict: false });
for (const f of await jsonFiles(schemasDir)) {
  ajv.addSchema(await readJson(f), basename(f));
}

/** @type {Map<string, any>} */
const docs = new Map();
for (const f of await jsonFiles(contentDir)) {
  if (f.startsWith(schemasDir)) continue;
  let data;
  try {
    data = await readJson(f);
  } catch (e) {
    fail(f, `invalid JSON: ${/** @type {Error} */ (e).message}`);
    continue;
  }
  docs.set(f, data);
  const name = schemaFor(f);
  if (!name) continue;
  const validate = ajv.getSchema(`${name}.schema.json`);
  if (!validate) {
    fail(f, `schema ${name}.schema.json not found`);
    continue;
  }
  if (!validate(data)) {
    for (const e of validate.errors ?? []) fail(f, `schema ${e.instancePath || '/'} ${e.message}`);
  }
}

// 2. References
/** @param {string} rel */
const doc = (rel) => docs.get(join(contentDir, rel));
/** @param {any} d @param {string} key @returns {Set<string>} */
const ids = (d, key) => new Set((d?.[key] ?? []).map((/** @type {any} */ x) => x.id));

const vulns = ids(doc('catalog/vulnerabilities.json'), 'items');
const flipperLines = ids(doc('flipper.json'), 'lines');
const consequences = ids(doc('consequences.json'), 'items');
const interludes = ids(doc('interludes.json'), 'items');
const codex = new Set();
const npcFiles = new Map();
const cases = new Map();
for (const [f, d] of docs) {
  const rel = relative(contentDir, f).replaceAll('\\', '/');
  if (rel.startsWith('catalog/codex/')) {
    codex.add(d.id);
    if (`${d.id}.json` !== basename(f)) fail(f, `id ${d.id} does not match file name`);
  } else if (rel.startsWith('npc/')) npcFiles.set(d.npc, { file: f, data: d });
  else if (rel.startsWith('cases/')) cases.set(d.id, { file: f, data: d });
}

/** @param {string} file @param {string} what @param {Iterable<any>} list */
function checkUnique(file, what, list) {
  const seen = new Set();
  for (const x of list) {
    if (seen.has(x)) fail(file, `duplicate ${what} id "${x}"`);
    seen.add(x);
  }
}

/** @param {string} file @param {string} where @param {string} what @param {any} id @param {Set<any>} pool */
function ref(file, where, what, id, pool) {
  if (id !== undefined && !pool.has(id)) fail(file, `${where}: unknown ${what} "${id}"`);
}

const vulnFile = join(contentDir, 'catalog/vulnerabilities.json');
for (const v of doc('catalog/vulnerabilities.json')?.items ?? []) {
  ref(vulnFile, v.id, 'codex card', v.codexCardId, codex);
}
checkUnique(
  vulnFile,
  'vulnerability',
  (doc('catalog/vulnerabilities.json')?.items ?? []).map((/** @type {any} */ v) => v.id),
);
const puzzlesFile = join(contentDir, 'catalog/puzzles.json');
for (const p of doc('catalog/puzzles.json')?.items ?? []) ref(puzzlesFile, p.archetype, 'vulnerability', p.vuln, vulns);
checkUnique(
  join(contentDir, 'flipper.json'),
  'flipper line',
  (doc('flipper.json')?.lines ?? []).map((/** @type {any} */ l) => l.id),
);
for (const v of codex) if (!vulns.has(v)) fail(join(contentDir, `catalog/codex/${v}.json`), `orphan codex card ${v}`);

const campaignFile = join(contentDir, 'campaign.json');
const campaign = doc('campaign.json');
const campaignCases = new Set();
for (const level of campaign?.levels ?? []) {
  for (const c of level.cases ?? []) {
    if (campaignCases.has(c)) fail(campaignFile, `case ${c} listed twice`);
    campaignCases.add(c);
    ref(campaignFile, level.id, 'case', c, new Set(cases.keys()));
  }
}
for (const i of campaign?.interludes ?? []) {
  ref(campaignFile, 'interludes', 'case', i.afterCase, campaignCases);
  ref(campaignFile, 'interludes', 'interlude', i.interlude, interludes);
}
for (const [id, { file }] of cases) if (!campaignCases.has(id)) fail(file, `orphan case ${id}: not in campaign.json`);

/**
 * Walks conditions and effects, calling visit(key, value) for every typed leaf.
 * @param {any} node @param {(key: string, value: any) => void} visit
 */
function walkLogic(node, visit) {
  if (Array.isArray(node)) return node.forEach((n) => walkLogic(n, visit));
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (k === 'all' || k === 'any') walkLogic(v, visit);
    else if (k === 'not') walkLogic(v, visit);
    else visit(k, v);
  }
}

for (const [caseId, { file, data: c }] of cases) {
  if (`${caseId}.json` !== basename(file)) fail(file, `id ${caseId} does not match file name`);
  const nodes = ids(c, 'nodes');
  const segments = ids(c, 'segments');
  const clues = ids(c, 'clues');
  const objectives = ids(c, 'objectives');
  const keys = new Set((c.keyRecipes ?? []).map((/** @type {any} */ k) => k.output));
  const npcs = new Set(c.npcs ?? []);
  const locks = new Set((c.nodes ?? []).filter((/** @type {any} */ n) => n.lock).map((/** @type {any} */ n) => n.id));
  const tracks = ids(c, 'tracks');

  checkUnique(
    file,
    'node',
    (c.nodes ?? []).map((/** @type {any} */ n) => n.id),
  );
  checkUnique(
    file,
    'segment',
    (c.segments ?? []).map((/** @type {any} */ n) => n.id),
  );
  checkUnique(
    file,
    'clue',
    (c.clues ?? []).map((/** @type {any} */ n) => n.id),
  );
  checkUnique(
    file,
    'objective',
    (c.objectives ?? []).map((/** @type {any} */ n) => n.id),
  );
  checkUnique(
    file,
    'key',
    (c.keyRecipes ?? []).map((/** @type {any} */ k) => k.output),
  );
  checkUnique(
    file,
    'finding',
    (c.report?.findings ?? []).map((/** @type {any} */ n) => n.id),
  );
  for (const k of keys) if (clues.has(k)) fail(file, `id "${k}" is both a clue and a key`);

  /** @type {Set<string>} */
  const flagsSet = new Set();
  /** @type {{ where: string, flag: string }[]} */
  const flagsRead = [];
  const obtainable = new Set(
    (c.clues ?? []).filter((/** @type {any} */ cl) => cl.foundOn).map((/** @type {any} */ cl) => cl.id),
  );
  const usedKeys = new Set();

  /** @param {string} where @param {any} logic */
  const checkLogic = (where, logic) =>
    walkLogic(logic, (k, v) => {
      switch (k) {
        case 'nodeState':
          return ref(file, where, 'node', v.node, nodes);
        case 'hasClue':
          return ref(file, where, 'clue', v, clues);
        case 'hasKey':
          usedKeys.add(v);
          return ref(file, where, 'key', v, keys);
        case 'segmentOpen':
        case 'openSegment':
          return ref(file, where, 'segment', v, segments);
        case 'lockFilled':
          return ref(file, where, 'lock node', v, locks);
        case 'npcFactRevealed':
          return ref(file, where, 'npc', v.npc, npcs);
        case 'trackBelow':
        case 'trackAbove':
          return ref(file, where, 'track', v.track, tracks);
        case 'addTrack':
          return ref(file, where, 'track', v.track, tracks);
        case 'flag':
          return flagsRead.push({ where, flag: v });
        case 'setFlag':
          return flagsSet.add(v);
        case 'compromiseNode':
          return ref(file, where, 'node', v, nodes);
        case 'revealNodes':
          return v.forEach((/** @type {string} */ n) => ref(file, where, 'node', n, nodes));
        case 'grantClues':
          return v.forEach((/** @type {string} */ n) => {
            obtainable.add(n);
            ref(file, where, 'clue', n, clues);
          });
        case 'unlockCodex':
          return ref(file, where, 'codex card', v, codex);
        case 'flipperSay':
          return ref(file, where, 'flipper line', v, flipperLines);
        case 'completeObjective':
          return ref(file, where, 'objective', v, objectives);
      }
    });

  ref(file, 'scope', 'consequence', c.scope?.consequence, consequences);
  for (const n of c.nodes ?? []) {
    const at = `node ${n.id}`;
    ref(file, at, 'segment', n.segment, segments);
    ref(file, at, 'npc', n.npc, npcs);
    checkLogic(at, n.revealedBy);
    checkLogic(at, n.onCompromise);
    for (const e of n.exploits ?? []) {
      ref(file, at, 'vulnerability', e.vuln, vulns);
      checkLogic(at, e.requires);
      checkLogic(at, e.effects);
      for (const cl of e.puzzleParams?.clues ?? []) {
        ref(file, at, 'clue', cl, clues);
      }
    }
    for (const v of Object.keys(n.failHints ?? {})) ref(file, `${at} failHints`, 'vulnerability', v, vulns);
    for (const s of n.lock?.sockets ?? []) {
      const key = String(s.accepts).replace(/^key:/, '');
      usedKeys.add(key);
      ref(file, `${at} socket ${s.id}`, 'key', key, keys);
    }
  }
  for (const e of c.edges ?? []) {
    ref(file, `edge ${e.from}->${e.to}`, 'node', e.from, nodes);
    ref(file, `edge ${e.from}->${e.to}`, 'node', e.to, nodes);
    checkLogic(`edge ${e.from}->${e.to}`, e.revealedBy);
  }
  if ((c.nodes ?? []).length > 1) {
    const linked = new Set((c.edges ?? []).flatMap((/** @type {any} */ e) => [e.from, e.to]));
    for (const n of nodes) if (!linked.has(n)) fail(file, `orphan node "${n}": no edges`);
  }
  for (const cl of c.clues ?? []) ref(file, `clue ${cl.id}`, 'node', cl.foundOn, nodes);
  for (const k of c.keyRecipes ?? []) {
    for (const i of k.inputs ?? []) {
      if (!clues.has(i) && !keys.has(i)) fail(file, `key ${k.output}: unknown input "${i}"`);
      usedKeys.add(i);
    }
  }
  for (const o of c.objectives ?? []) {
    ref(file, `objective ${o.id}`, 'objective', o.parent, objectives);
    checkLogic(`objective ${o.id}`, o.doneWhen);
  }
  for (const r of c.ranks ?? []) checkLogic(`rank ${r.id}`, r.when);
  for (const cp of c.checkpoints ?? []) checkLogic(`checkpoint ${cp.id}`, cp.when);
  for (const f of c.report?.findings ?? []) {
    ref(file, `finding ${f.id}`, 'vulnerability', f.vuln, vulns);
    ref(file, `finding ${f.id}`, 'node', f.node, nodes);
    const correct = (f.options ?? []).filter((/** @type {any} */ o) => o.correct).length;
    if (correct !== 1) fail(file, `finding ${f.id}: ${correct} correct options, expected exactly 1`);
    checkUnique(
      file,
      `finding ${f.id} option`,
      (f.options ?? []).map((/** @type {any} */ o) => o.id),
    );
  }

  for (const npcId of npcs) {
    const npc = npcFiles.get(npcId);
    if (!npc) {
      fail(file, `npc "${npcId}" has no content/npc/${npcId}.json`);
      continue;
    }
    const d = npc.data;
    for (const h of d.holds ?? []) {
      ref(npc.file, `holds (${caseId})`, 'clue', h, clues);
      obtainable.add(h);
    }
    for (const l of d.requires?.legend ?? []) {
      usedKeys.add(l);
      ref(npc.file, `requires.legend (${caseId})`, 'key', l, keys);
    }
    for (const cl of d.requires?.clues ?? []) {
      ref(npc.file, `requires.clues (${caseId})`, 'clue', cl, clues);
    }
    ref(npc.file, 'codex', 'codex card', d.codex, codex);
    for (const r of d.rules ?? []) {
      const cond = r.if ?? {};
      if (r.then?.reply && !(r.then.reply in (d.replies ?? {}))) {
        fail(npc.file, `rule reply "${r.then.reply}" not in replies`);
      }
      for (const k of ['has_key', 'missing_key']) if (cond[k]) ref(npc.file, `rule ${k}`, 'key', cond[k], keys);
      for (const k of ['has_clue', 'missing_clue']) if (cond[k]) ref(npc.file, `rule ${k}`, 'clue', cond[k], clues);
      for (const g of r.then?.grant ?? []) ref(npc.file, 'rule grant', 'clue', g, new Set(d.holds ?? []));
    }
  }

  for (const { where, flag } of flagsRead) {
    if (!flagsSet.has(flag)) fail(file, `${where}: flag "${flag}" is never set`);
  }
  for (const cl of clues) if (!obtainable.has(cl)) fail(file, `orphan clue "${cl}": cannot be obtained`);
  for (const k of keys) if (!usedKeys.has(k)) fail(file, `orphan key "${k}": never used`);
}
for (const [id, { file }] of npcFiles) {
  if ([...cases.values()].every(({ data }) => !(data.npcs ?? []).includes(id))) fail(file, `orphan npc "${id}"`);
}

// 3. Stop dictionary (NFR-09)
const stop = await readJson(join(here, 'stopwords.json'));
const toolRe = new RegExp(
  `(?<![\\p{L}\\p{N}_-])(?:${stop.tools.map((/** @type {string} */ t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|')})(?![\\p{L}\\p{N}_-])`,
  'iu',
);
const patternRes = stop.patterns.map((/** @type {string} */ p) => new RegExp(p, 'iu'));
const ipRe = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/u;

/** @param {string} file @param {any} value @param {string} path */
function scanText(file, value, path) {
  if (typeof value === 'string') {
    const hit =
      value.match(toolRe)?.[0] ??
      value.match(ipRe)?.[0] ??
      patternRes.map((/** @type {RegExp} */ r) => value.match(r)?.[0]).find(Boolean);
    if (hit) fail(file, `stop-word ${path}: "${hit}"`);
  } else if (Array.isArray(value)) value.forEach((v, i) => scanText(file, v, `${path}/${i}`));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) scanText(file, v, `${path}/${k}`);
  }
}
for (const [f, d] of docs) scanText(f, d, '');

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\ncontent-check: ${errors.length} error(s)`);
  process.exit(1);
}
console.log(`content-check: ${docs.size} files OK`);
