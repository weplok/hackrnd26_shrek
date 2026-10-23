// Per-event validation for the blocks-telemetry function: wire contract
// blocks/v1 sent by caveman-blocks `telemetry flush`
// (https://github.com/caveman-ai/blocks/blob/main/docs/TELEMETRY.md). The
// transport rules (bounded body, edge IP, no browsers) are cli-telemetry's.
// Invalid events are dropped whole, never partially stored, except three
// values that degrade on their own so an older function neither learns a
// user's block names nor drops a newer client's events: install_channel, a
// block name that is not first-party, and map keys this file does not know.

// First-party blocks (blocks/ in caveman-ai/blocks). Adding a first-party block
// to caveman-blocks means adding its name here; until then the name is stored
// as null on command_run and dropped from daily_usage.first_party_runs.
export const FIRST_PARTY_BLOCKS: ReadonlySet<string> = new Set([
  "json-peek", "jsonl-stats", "test-summary", "first-error", "wait-for", "grep-defs", "http-json", "replace-in-file",
]);

const MAX_COUNT = 2 ** 32;
// One install's day: a hook event every second is 86,400. The endpoint is
// unauthenticated, so these bound what one forged row can add to a sum.
const MAX_DAILY = 2 ** 24;
const MAX_BYTES = 2 ** 36;
const DAY_MS = 86_400_000;
const EVENTS = new Set(["first_run", "command_run", "daily_usage"]);
// Go's GOOS and GOARCH values.
const OS = new Set(["darwin", "linux", "windows", "freebsd", "openbsd", "netbsd", "dragonfly", "solaris", "illumos", "aix", "android", "ios", "plan9"]);
const ARCH = new Set(["amd64", "arm64", "386", "arm", "riscv64", "ppc64", "ppc64le", "s390x", "loong64", "mips", "mipsle", "mips64", "mips64le", "wasm"]);
const INSTALL_CHANNELS = new Set(["npx", "brew", "direct", "source"]);
const COMMANDS = new Set(["init", "hooks", "add", "run", "lint", "verify", "sync", "scan", "promote", "retire", "export", "stats", "doctor", "telemetry", "unknown"]);
const SUBCOMMANDS = new Map([["hooks", new Set(["install", "uninstall", "status"])], ["telemetry", new Set(["on", "off", "status"])]]);
const HARNESSES = new Set(["claude", "codex", "cursor", "generic", "opencode", "copilot", "gemini"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const VERSION_RE = /^[A-Za-z0-9._+-]{1,64}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

type Raw = Record<string, unknown>;
type Counts = Record<string, number>;
// Always every blocks_events column but id, received_at and ip (set by
// index.ts), so a mixed batch never relies on PostgREST filling gaps.
export type Row = Record<string, string | number | boolean | Counts | null>;

class Invalid extends Error {}

function check(ok: boolean): void {
  if (!ok) throw new Invalid();
}

// Absent and null read as the zero value, as a Go decoder would; a present
// value of the wrong type rejects the event.
function str(raw: Raw, key: string): string {
  const v = raw[key];
  if (v === undefined || v === null) return "";
  check(typeof v === "string");
  return v as string;
}

function int(raw: Raw, key: string, max = MAX_COUNT): number {
  const v = raw[key];
  if (v === undefined || v === null) return 0;
  check(Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) < max);
  return v as number;
}

function optInt(raw: Raw, key: string, max = MAX_COUNT): number | null {
  return raw[key] === undefined || raw[key] === null ? null : int(raw, key, max);
}

function bool(raw: Raw, key: string): boolean {
  const v = raw[key];
  if (v === undefined || v === null) return false;
  check(typeof v === "boolean");
  return v as boolean;
}

function isObject(v: unknown): v is Raw {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// A name -> count map. Keys outside `known` are dropped unread; a known key
// must carry a valid count. Anything but an object rejects the event.
function counts(raw: Raw, key: string, known: ReadonlySet<string>, max: number): Counts {
  const v = raw[key];
  if (v === undefined || v === null) return {};
  check(isObject(v));
  const out: Counts = {};
  for (const name of Object.keys(v as Raw)) {
    if (known.has(name)) out[name] = int(v as Raw, name, max);
  }
  return out;
}

// Every field type's zero value, which a Go encoder emits for a field it has
// nothing to put in. Anything else is set.
function anySet(fields: Raw): boolean {
  return Object.values(fields).some((v) =>
    !(v === undefined || v === null || v === 0 || v === false || v === "" || (isObject(v) && Object.keys(v).length === 0))
  );
}

// Each event's own fields, stored as null on every other event.
function orNull(fields: Raw, keep: boolean): Raw {
  return keep ? fields : Object.fromEntries(Object.keys(fields).map((k) => [k, null]));
}

// A real calendar day within [today - 8, today] (UTC). The client sends complete
// days at most 7 back; one more day absorbs clock skew.
function validDay(day: string, now: Date): boolean {
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (!DAY_RE.test(day) || !Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== day) return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return ms >= today - 8 * DAY_MS && ms <= today;
}

export function validateEvent(input: unknown, now: Date = new Date()): Row | null {
  if (!isObject(input)) return null;
  try {
    return toRow(input, now);
  } catch (error) {
    if (error instanceof Invalid) return null;
    throw error;
  }
}

function toRow(raw: Raw, now: Date): Row {
  const anonymousId = str(raw, "anonymous_id");
  const event = str(raw, "event");
  check(str(raw, "schema") === "blocks/v1" && UUID_RE.test(anonymousId) && EVENTS.has(event));

  const ts = str(raw, "ts");
  const tsMs = Date.parse(ts);
  // The upper bound keeps an offset from pushing the stored value past what timestamptz parses.
  check(RFC3339_RE.test(ts) && Number.isFinite(tsMs) && tsMs > Date.parse("0001-01-01T00:00:00Z") && tsMs < Date.UTC(9999, 0, 1));

  const cliVersion = str(raw, "cli_version");
  const os = str(raw, "os");
  const arch = str(raw, "arch");
  check(VERSION_RE.test(cliVersion) && OS.has(os) && ARCH.has(arch));
  const channel = raw.install_channel;

  const cmd = {
    command: str(raw, "command"),
    subcommand: str(raw, "subcommand"),
    block: str(raw, "block"),
    duration_ms: optInt(raw, "duration_ms"),
    exit_class: str(raw, "exit_class"),
    error_class: str(raw, "error_class"),
  };
  const isCommand = event === "command_run";
  if (isCommand) {
    check(COMMANDS.has(cmd.command)
      && (cmd.subcommand === "" || SUBCOMMANDS.get(cmd.command)?.has(cmd.subcommand) === true)
      && (cmd.block === "" || cmd.command === "add" || cmd.command === "run")
      && (cmd.exit_class === "ok" || cmd.exit_class === "error")
      && (cmd.error_class === "" || (cmd.exit_class === "error" && (cmd.error_class === "usage" || cmd.error_class === "failed"))));
  } else {
    check(!anySet(cmd));
  }

  const scan = {
    scan_window_days: int(raw, "scan_window_days"),
    scan_commands: int(raw, "scan_commands"),
    scan_scripts: int(raw, "scan_scripts"),
    scan_edits: int(raw, "scan_edits"),
    scan_shapes: int(raw, "scan_shapes"),
    scan_repeated_shapes: int(raw, "scan_repeated_shapes"),
    scan_covered_shapes: int(raw, "scan_covered_shapes"),
    scan_covered_scripts: int(raw, "scan_covered_scripts"),
    scan_top_count: int(raw, "scan_top_count"),
  };
  const isScan = isCommand && cmd.command === "scan" && cmd.exit_class === "ok";
  if (isScan) {
    check(scan.scan_edits <= scan.scan_scripts && scan.scan_repeated_shapes <= scan.scan_shapes
      && scan.scan_covered_shapes <= scan.scan_shapes && scan.scan_covered_scripts <= scan.scan_scripts
      && scan.scan_top_count <= scan.scan_scripts && scan.scan_window_days <= 3660);
  } else {
    check(!anySet(scan));
  }

  const day = str(raw, "day");
  const usage = {
    repos_active: int(raw, "repos_active", MAX_DAILY),
    sessions: int(raw, "sessions", MAX_DAILY),
    scripts: int(raw, "scripts", MAX_DAILY),
    // Bytes of the captured scripts' bodies, never the text. Null when absent:
    // clients before this field captured scripts without counting their bytes.
    scripts_bytes: optInt(raw, "scripts_bytes", MAX_BYTES),
    hints: int(raw, "hints", MAX_DAILY),
    hints_followed: int(raw, "hints_followed", MAX_DAILY),
    promote_hints: int(raw, "promote_hints", MAX_DAILY),
    calls: int(raw, "calls", MAX_DAILY),
    runs: int(raw, "runs", MAX_DAILY),
    runs_failed: int(raw, "runs_failed", MAX_DAILY),
    runs_user: int(raw, "runs_user", MAX_DAILY),
    verify_pass: int(raw, "verify_pass", MAX_DAILY),
    verify_fail: int(raw, "verify_fail", MAX_DAILY),
    bytes_full: int(raw, "bytes_full", MAX_BYTES),
    bytes_returned: int(raw, "bytes_returned", MAX_BYTES),
    blocks_first_party: int(raw, "blocks_first_party", MAX_DAILY),
    blocks_user: int(raw, "blocks_user", MAX_DAILY),
  };
  const firstPartyRuns = counts(raw, "first_party_runs", FIRST_PARTY_BLOCKS, MAX_DAILY);
  const harnessSessions = counts(raw, "harness_sessions", HARNESSES, MAX_DAILY);
  const isDaily = event === "daily_usage";
  if (isDaily) {
    const firstPartyTotal = Object.values(firstPartyRuns).reduce((a, b) => a + b, 0);
    // Only relations the client guarantees for every honest day. Two that look
    // right are not: a hint shown before UTC midnight is credited on the day of
    // its call, so hints_followed can exceed that day's hints; and the runner's
    // wrapper (the unverified mark, the truncation envelope) can make the bytes
    // returned exceed the bytes a block printed.
    // No script captured means no script bytes.
    // A run is first-party or not, and a block that ran has at least one run.
    // The sum over harnesses is not tied to sessions: one session can be seen
    // under two harness names.
    check(validDay(day, now) && usage.hints_followed <= usage.calls
      && (usage.scripts > 0 || !usage.scripts_bytes)
      && usage.runs_failed <= usage.runs && usage.runs_user + firstPartyTotal <= usage.runs
      && usage.blocks_first_party + usage.blocks_user <= usage.runs && usage.blocks_user <= usage.runs_user
      && Object.values(harnessSessions).every((n) => n <= usage.sessions));
  } else {
    // The raw maps: a foreign map with only unknown keys is still set.
    check(!anySet({ day, ...usage, first_party_runs: raw.first_party_runs, harness_sessions: raw.harness_sessions }));
  }

  return {
    ts: new Date(tsMs).toISOString(),
    anonymous_id: anonymousId.toLowerCase(),
    event,
    cli_version: cliVersion,
    os,
    arch,
    install_channel: typeof channel === "string" && INSTALL_CHANNELS.has(channel) ? channel : null,
    linked: bool(raw, "linked"),
    ...orNull({
      command: cmd.command,
      subcommand: cmd.subcommand || null,
      block: FIRST_PARTY_BLOCKS.has(cmd.block) ? cmd.block : null,
      duration_ms: cmd.duration_ms,
      exit_class: cmd.exit_class,
      error_class: cmd.error_class || null,
    }, isCommand),
    ...orNull(scan, isScan),
    ...orNull({ day, ...usage, first_party_runs: firstPartyRuns, harness_sessions: harnessSessions }, isDaily),
  } as Row;
}
