export type TerminalCommand =
  | { type: 'help' }
  | { type: 'scan'; node: string }
  | { type: 'codex'; vuln: string }
  | { type: 'hypothesis'; node: string; vuln: string };

export type ParseErrorCode = 'empty' | 'unknown-command' | 'unknown-node' | 'unknown-vuln' | 'usage';

export type ParseResult = TerminalCommand | { type: 'error'; code: ParseErrorCode; token?: string };

export interface TerminalContext {
  nodes: readonly string[];
  vulns: readonly string[];
}

export interface Completion {
  value: string;
  options: string[];
}

const KEYWORDS = ['help', 'scan', 'codex'] as const;
const VULN_RE = /^(sl|сл)-?(\d{1,2})$/iu;
const CYRILLIC_PREFIX_RE = /^с/iu;

// SL-01 and СЛ-01 are the same weakness (FR-031); content ids use the Latin form.
export function normalizeVuln(token: string): string | null {
  const match = VULN_RE.exec(token.trim());
  if (!match?.[2]) return null;
  return `SL-${match[2].padStart(2, '0')}`;
}

function tokenize(input: string): string[] {
  return input.trim().split(/\s+/u).filter(Boolean);
}

function findNode(ctx: TerminalContext, token: string): string | undefined {
  const lower = token.toLowerCase();
  return ctx.nodes.find((node) => node.toLowerCase() === lower);
}

function parseVuln(ctx: TerminalContext, token: string | undefined): string | ParseResult {
  if (!token) return { type: 'error', code: 'usage' };
  const vuln = normalizeVuln(token);
  if (!vuln || !ctx.vulns.includes(vuln)) return { type: 'error', code: 'unknown-vuln', token };
  return vuln;
}

export function parseCommand(input: string, ctx: TerminalContext): ParseResult {
  const [head, arg, ...rest] = tokenize(input);
  if (!head) return { type: 'error', code: 'empty' };
  if (rest.length > 0) return { type: 'error', code: 'usage' };
  const keyword = head.toLowerCase();

  if (keyword === 'help') return arg ? { type: 'error', code: 'usage' } : { type: 'help' };
  if (keyword === 'scan') {
    if (!arg) return { type: 'error', code: 'usage' };
    const node = findNode(ctx, arg);
    return node ? { type: 'scan', node } : { type: 'error', code: 'unknown-node', token: arg };
  }
  if (keyword === 'codex') {
    const vuln = parseVuln(ctx, arg);
    return typeof vuln === 'string' ? { type: 'codex', vuln } : vuln;
  }

  const node = findNode(ctx, head);
  if (!node) return { type: 'error', code: 'unknown-command', token: head };
  const vuln = parseVuln(ctx, arg);
  return typeof vuln === 'string' ? { type: 'hypothesis', node, vuln } : vuln;
}

function displayVuln(id: string, cyrillic: boolean): string {
  return cyrillic ? id.replace('SL', 'СЛ') : id;
}

function vulnCandidates(ctx: TerminalContext, prefix: string): string[] {
  const cyrillic = CYRILLIC_PREFIX_RE.test(prefix);
  const latin = prefix.replace(/^сл/iu, 'SL').replace(/^с/iu, 'S').toUpperCase();
  return ctx.vulns.filter((id) => id.startsWith(latin)).map((id) => displayVuln(id, cyrillic));
}

function commonPrefix(values: string[]): string {
  const [first = '', ...rest] = values;
  let end = first.length;
  for (const value of rest) {
    while (end > 0 && value.slice(0, end).toLowerCase() !== first.slice(0, end).toLowerCase()) end -= 1;
  }
  return first.slice(0, end);
}

export function complete(input: string, ctx: TerminalContext): Completion {
  const tokens = tokenize(input);
  const typingNew = input === '' || /\s$/u.test(input);
  const done = typingNew ? tokens : tokens.slice(0, -1);
  const current = typingNew ? '' : (tokens.at(-1) ?? '');

  let candidates: string[];
  if (done.length === 0) {
    const lower = current.toLowerCase();
    candidates = [...KEYWORDS, ...ctx.nodes].filter((word) => word.toLowerCase().startsWith(lower));
  } else if (done.length === 1) {
    const head = done[0]?.toLowerCase() ?? '';
    if (head === 'scan') {
      candidates = ctx.nodes.filter((node) => node.toLowerCase().startsWith(current.toLowerCase()));
    } else if (head === 'codex' || findNode(ctx, head)) {
      candidates = vulnCandidates(ctx, current);
    } else {
      candidates = [];
    }
  } else {
    candidates = [];
  }

  const base = done.length > 0 ? `${done.join(' ')} ` : '';
  if (candidates.length === 0) return { value: input, options: [] };
  if (candidates.length === 1) return { value: `${base}${candidates[0] ?? ''} `, options: [] };
  const shared = commonPrefix(candidates);
  return { value: shared.length > current.length ? `${base}${shared}` : input, options: candidates };
}
