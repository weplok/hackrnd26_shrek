// Run: node --test supabase/functions/blocks-telemetry/ingest.test.ts (Node >= 22.18)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FIRST_PARTY_BLOCKS, validateEvent } from "./ingest.ts";

// The day window is relative to this.
const NOW = new Date("2026-10-03T15:00:00Z");

// Shapes from the contract's tables (blocks docs/TELEMETRY.md, "Events").
const base = {
  schema: "blocks/v1",
  ts: "2026-10-03T14:59:58Z",
  anonymous_id: "22222222-2222-4222-8222-222222222222",
  cli_version: "0.4.0",
  os: "darwin",
  arch: "arm64",
  install_channel: "brew",
  linked: false,
};
const firstRun = { ...base, event: "first_run" };
const commandRun = { ...base, event: "command_run", command: "add", subcommand: "", block: "json-peek", duration_ms: 182, exit_class: "ok", error_class: "" };
const hooksInstall = { ...base, event: "command_run", command: "hooks", subcommand: "install", duration_ms: 40, exit_class: "ok", error_class: "" };
const telemetryOff = { ...base, event: "command_run", command: "telemetry", subcommand: "off", duration_ms: 3, exit_class: "ok" };
const usageError = { ...base, event: "command_run", command: "run", duration_ms: 5, exit_class: "error", error_class: "usage" };
const scanRun = {
  ...base, event: "command_run", command: "scan", subcommand: "", duration_ms: 2400, exit_class: "ok", error_class: "",
  scan_window_days: 30, scan_commands: 5120, scan_scripts: 340, scan_edits: 12, scan_shapes: 90,
  scan_repeated_shapes: 31, scan_covered_shapes: 9, scan_covered_scripts: 120, scan_top_count: 44,
};
const dailyUsage = {
  ...base, event: "daily_usage", day: "2026-10-02",
  repos_active: 3, sessions: 7, scripts: 210, scripts_bytes: 512_000, hints: 40, hints_followed: 18, promote_hints: 2, calls: 25,
  runs: 31, runs_failed: 2, runs_user: 4, verify_pass: 5, verify_fail: 1, bytes_full: 1_800_000, bytes_returned: 64_000,
  blocks_first_party: 4, blocks_user: 1,
  first_party_runs: { "json-peek": 12, "test-summary": 9, "first-error": 4, "grep-defs": 2 },
  harness_sessions: { claude: 5, codex: 2 },
};

// public.blocks_events' columns, read from the migration so the two cannot drift.
const migration = readFileSync(new URL("../../migrations/20261003230000_blocks_telemetry.sql", import.meta.url), "utf8");
const tableBody = migration.slice(migration.indexOf("create table public.blocks_events ("), migration.indexOf("\n);"));
// Columns added by later migrations (the first two are applied and never edited).
const added = readFileSync(new URL("../../migrations/20261012230000_blocks_telemetry_scripts_bytes_limits.sql", import.meta.url), "utf8");
const columns = [
  ...[...tableBody.matchAll(/^ {2}([a-z_0-9]+) [a-z]/gm)].map((m) => m[1]).filter((c) => c !== "constraint"),
  ...[...added.matchAll(/^alter table public\.blocks_events add column if not exists ([a-z_0-9]+) /gm)].map((m) => m[1]),
];
const rowKeys = columns.filter((c) => !["id", "received_at", "ip"].includes(c)).sort();

const ok = (event: unknown) => validateEvent(event, NOW);

test("the column list was read from the migration", () => {
  assert.equal(columns.length, 46);
  assert.ok(columns.includes("first_party_runs") && columns.includes("scan_top_count") && columns.includes("linked"));
});

test("accepts every event shape in the contract", () => {
  for (const event of [firstRun, commandRun, hooksInstall, telemetryOff, usageError, scanRun, dailyUsage]) {
    assert.ok(ok(event), `${event.event} ${(event as { command?: string }).command ?? ""} should be accepted`);
  }
  for (const command of ["init", "lint", "verify", "sync", "promote", "retire", "export", "stats", "doctor", "unknown"]) {
    assert.ok(ok({ ...base, event: "command_run", command, exit_class: "error", error_class: "failed" }), command);
  }
  for (const block of FIRST_PARTY_BLOCKS) assert.equal(ok({ ...commandRun, command: "run", block })!.block, block);
});

test("every row carries exactly the table's columns, whatever was sent", () => {
  const extra = { prompt: "secret", path: "/home/me/repo", id: 1, received_at: "2020-01-01T00:00:00Z", ip: "1.2.3.4" };
  for (const event of [firstRun, commandRun, scanRun, dailyUsage]) {
    const row = ok({ ...event, ...extra })!;
    assert.deepEqual(Object.keys(row).sort(), rowKeys, event.event);
  }
});

test("normalizes and stores each event's own fields only", () => {
  const first = ok({ ...firstRun, anonymous_id: base.anonymous_id.toUpperCase(), ts: "2026-10-03T16:59:58+02:00" })!;
  assert.equal(first.anonymous_id, base.anonymous_id);
  assert.equal(first.ts, "2026-10-03T14:59:58.000Z");
  assert.equal(first.linked, false);
  assert.equal(first.command, null);
  assert.equal(first.day, null);
  assert.equal(ok({ ...firstRun, linked: undefined })!.linked, false, "absent linked is false");
  assert.equal(ok({ ...firstRun, linked: true })!.linked, true);

  const add = ok(commandRun)!;
  assert.equal(add.block, "json-peek");
  assert.equal(add.subcommand, null);
  assert.equal(add.error_class, null);
  assert.equal(add.scan_scripts, null, "scan totals only on a successful scan");
  assert.equal(add.runs, null, "usage counts only on daily_usage");
  assert.equal(ok({ ...commandRun, duration_ms: undefined })!.duration_ms, null);

  const scan = ok(scanRun)!;
  assert.equal(scan.scan_covered_scripts, 120);
  assert.equal(ok({ ...scanRun, scan_edits: undefined })!.scan_edits, 0, "a scan count left out is 0");

  const daily = ok(dailyUsage)!;
  assert.equal(daily.day, "2026-10-02");
  assert.equal(daily.bytes_full, 1_800_000);
  assert.equal(daily.scripts_bytes, 512_000);
  assert.equal(daily.command, null);
  assert.deepEqual(daily.first_party_runs, dailyUsage.first_party_runs);
  assert.deepEqual(daily.harness_sessions, { claude: 5, codex: 2 });
  const sparse = ok({ ...base, event: "daily_usage", day: "2026-10-02", runs: 1 })!;
  assert.equal(sparse.hints, 0, "absent counter is 0");
  assert.equal(sparse.scripts_bytes, null, "absent scripts_bytes is unknown, not 0");
  assert.equal(ok({ ...dailyUsage, scripts_bytes: undefined })!.scripts_bytes, null, "a client before scripts_bytes is accepted");
  assert.equal(add.scripts_bytes, null, "scripts_bytes only on daily_usage");
  assert.deepEqual(sparse.first_party_runs, {});
  assert.deepEqual(sparse.harness_sessions, {});
});

test("a Go struct's zero values for other events' fields are not a leak", () => {
  const zeros = {
    command: "", subcommand: "", block: "", duration_ms: 0, exit_class: "", error_class: "",
    scan_window_days: 0, scan_commands: 0, scan_scripts: 0, scan_edits: 0, scan_shapes: 0, scan_repeated_shapes: 0,
    scan_covered_shapes: 0, scan_covered_scripts: 0, scan_top_count: 0,
    day: "", repos_active: 0, sessions: 0, scripts: 0, scripts_bytes: 0, hints: 0, hints_followed: 0, promote_hints: 0, calls: 0, runs: 0,
    runs_failed: 0, runs_user: 0, verify_pass: 0, verify_fail: 0, bytes_full: 0, bytes_returned: 0,
    blocks_first_party: 0, blocks_user: 0, first_party_runs: null, harness_sessions: {},
  };
  assert.ok(ok({ ...zeros, ...firstRun }));
  assert.ok(ok({ ...zeros, ...commandRun }));
  assert.ok(ok({ ...zeros, ...dailyUsage }));
  assert.equal(ok({ ...zeros, ...commandRun })!.day, null);
});

test("degrades a value on its own instead of dropping the event", () => {
  const userBlock = ok({ ...commandRun, block: "deploy-staging" })!;
  assert.equal(userBlock.block, null, "a block name that is not first-party is never stored");
  assert.equal(ok({ ...commandRun, command: "run", block: "Json-Peek" })!.block, null);

  for (const install_channel of ["npm", "BREW", "", 42, true, { a: 1 }]) {
    const row = ok({ ...firstRun, install_channel });
    assert.ok(row, `install_channel ${JSON.stringify(install_channel)}`);
    assert.equal(row!.install_channel, null);
  }

  const daily = ok({
    ...dailyUsage,
    first_party_runs: { ...dailyUsage.first_party_runs, "deploy-staging": 99, "my secret": "x" },
    harness_sessions: { claude: 5, vim: 3, emacs: "lots" },
  })!;
  assert.deepEqual(daily.first_party_runs, dailyUsage.first_party_runs);
  assert.deepEqual(daily.harness_sessions, { claude: 5 });
  assert.equal(JSON.stringify(daily).includes("deploy-staging"), false);
  // Parsed like the function parses a body: these become own keys.
  const parsed = ok(JSON.parse(JSON.stringify({ ...dailyUsage, first_party_runs: {} })
    .replace('"first_party_runs":{}', '"first_party_runs":{"__proto__":5,"constructor":1,"json-peek":3}')))!;
  assert.deepEqual(parsed.first_party_runs, { "json-peek": 3 });
  assert.equal(Object.getPrototypeOf(parsed.first_party_runs), Object.prototype);
  for (const harness of ["opencode", "copilot", "gemini", "generic", "cursor"]) {
    assert.deepEqual(ok({ ...dailyUsage, harness_sessions: { [harness]: 1 } })!.harness_sessions, { [harness]: 1 });
  }
});

test("rejects malformed and out-of-contract events", () => {
  const rejects: [string, unknown][] = [
    ["non-object", "first_run"],
    ["array", [firstRun]],
    ["null", null],
    ["wrong schema", { ...firstRun, schema: "cli/v1" }],
    ["missing schema", { ...firstRun, schema: undefined }],
    ["bad uuid", { ...firstRun, anonymous_id: "not-a-uuid" }],
    ["uuid with a suffix", { ...firstRun, anonymous_id: base.anonymous_id + "x" }],
    ["uuid with a prefix", { ...firstRun, anonymous_id: "x" + base.anonymous_id }],
    ["uuid with a newline", { ...firstRun, anonymous_id: base.anonymous_id + "\n" }],
    ["unknown event", { ...firstRun, event: "page_view" }],
    ["missing ts", { ...firstRun, ts: undefined }],
    ["non-RFC3339 ts", { ...firstRun, ts: "October 3, 2026" }],
    ["date-only ts", { ...firstRun, ts: "2026-10-03" }],
    ["zero ts", { ...firstRun, ts: "0001-01-01T00:00:00Z" }],
    ["ts past what timestamptz parses", { ...firstRun, ts: "9999-12-31T23:59:59-23:59" }],
    ["missing cli_version", { ...firstRun, cli_version: undefined }],
    ["empty cli_version", { ...firstRun, cli_version: "" }],
    ["free-text cli_version", { ...firstRun, cli_version: "1.0 beta" }],
    ["go devel version", { ...firstRun, cli_version: "(devel)" }],
    ["overlong cli_version", { ...firstRun, cli_version: "1".repeat(65) }],
    ["node os name", { ...firstRun, os: "win32" }],
    ["unknown os", { ...firstRun, os: "templeos" }],
    ["node arch name", { ...firstRun, arch: "x64" }],
    ["missing arch", { ...firstRun, arch: undefined }],
    ["string linked", { ...firstRun, linked: "true" }],
    ["number linked", { ...firstRun, linked: 1 }],
    // command_run
    ["unknown command", { ...commandRun, command: "deploy" }],
    ["missing command", { ...commandRun, command: undefined }],
    ["free-text command", { ...commandRun, command: "rm -rf /" }],
    ["subcommand on add", { ...commandRun, subcommand: "install" }],
    ["hooks subcommand on telemetry", { ...telemetryOff, subcommand: "install" }],
    ["telemetry subcommand on hooks", { ...hooksInstall, subcommand: "on" }],
    ["unknown hooks subcommand", { ...hooksInstall, subcommand: "reinstall" }],
    ["block on scan", { ...scanRun, block: "json-peek" }],
    ["user block on init", { ...commandRun, command: "init", block: "deploy-staging" }],
    ["non-string block", { ...commandRun, block: 7 }],
    ["string duration", { ...commandRun, duration_ms: "182" }],
    ["float duration", { ...commandRun, duration_ms: 1.5 }],
    ["negative duration", { ...commandRun, duration_ms: -1 }],
    ["duration too big", { ...commandRun, duration_ms: 2 ** 32 }],
    ["missing exit_class", { ...commandRun, exit_class: undefined }],
    ["bogus exit_class", { ...commandRun, exit_class: "crashed" }],
    ["unknown error_class", { ...usageError, error_class: "segfault" }],
    ["error_class on ok", { ...commandRun, error_class: "failed" }],
    ["scan totals on a failed scan", { ...scanRun, exit_class: "error", error_class: "failed" }],
    ["scan totals on add", { ...commandRun, scan_scripts: 3 }],
    ["scan edits > scripts", { ...scanRun, scan_edits: 341 }],
    ["scan repeated > shapes", { ...scanRun, scan_repeated_shapes: 91 }],
    ["scan covered shapes > shapes", { ...scanRun, scan_covered_shapes: 91 }],
    ["scan covered scripts > scripts", { ...scanRun, scan_covered_scripts: 341 }],
    ["scan top count > scripts", { ...scanRun, scan_top_count: 341 }],
    ["scan window too long", { ...scanRun, scan_window_days: 3661 }],
    ["scan string count", { ...scanRun, scan_shapes: "90" }],
    ["scan count too big", { ...scanRun, scan_commands: 2 ** 32 }],
    // daily_usage
    ["missing day", { ...dailyUsage, day: undefined }],
    ["counter as string", { ...dailyUsage, runs: "31" }],
    ["negative counter", { ...dailyUsage, verify_fail: -1 }],
    ["float counter", { ...dailyUsage, sessions: 2.5 }],
    ...["repos_active", "sessions", "scripts", "hints", "hints_followed", "promote_hints", "calls", "runs", "runs_failed",
      "runs_user", "verify_pass", "verify_fail", "blocks_first_party", "blocks_user"]
      .map((k): [string, unknown] => [`${k} too big`, { ...dailyUsage, [k]: 2 ** 24 }]),
    ["bytes_full too big", { ...dailyUsage, bytes_full: 2 ** 36 }],
    ["bytes_returned too big", { ...dailyUsage, bytes_returned: 2 ** 36 }],
    ["scripts_bytes too big", { ...dailyUsage, scripts_bytes: 2 ** 36 }],
    ["scripts_bytes as string", { ...dailyUsage, scripts_bytes: "512000" }],
    ["negative scripts_bytes", { ...dailyUsage, scripts_bytes: -1 }],
    ["scripts_bytes without scripts", { ...dailyUsage, scripts: 0, scripts_bytes: 10 }],
    ["map count too big", { ...dailyUsage, sessions: 2 ** 24 - 1, harness_sessions: { claude: 2 ** 24 } }],
    ["followed > calls", { ...dailyUsage, calls: 17 }],
    ["failed > runs", { ...dailyUsage, runs_failed: 32 }],
    ["user runs > runs", { ...dailyUsage, runs_user: 32 }],
    ["harness sessions > sessions", { ...dailyUsage, harness_sessions: { claude: 8 } }],
    ["user blocks > user runs", { ...dailyUsage, blocks_user: 5 }],
    ["first-party blocks > runs", { ...dailyUsage, blocks_first_party: 32 }],
    ["forged: only unbounded-looking fields set", { ...base, event: "daily_usage", day: "2026-10-02", blocks_user: 9, harness_sessions: { claude: 9 } }],
    ["first-party runs > runs", { ...dailyUsage, runs: 26, runs_user: 0, blocks_user: 0, runs_failed: 0 }],
    ["first-party + user runs > runs", { ...dailyUsage, runs_user: 5 }],
    ["blocks > runs", { ...base, event: "daily_usage", day: "2026-10-02", runs: 3, runs_user: 3, blocks_user: 2, blocks_first_party: 2 }],
    ["first_party_runs not an object", { ...dailyUsage, first_party_runs: [["json-peek", 1]] }],
    ["first_party_runs a string", { ...dailyUsage, first_party_runs: "json-peek" }],
    ["harness_sessions a number", { ...dailyUsage, harness_sessions: 5 }],
    ["known block with a bad count", { ...dailyUsage, first_party_runs: { "json-peek": "12" } }],
    ["known harness with a bad count", { ...dailyUsage, harness_sessions: { claude: -1 } }],
  ];
  for (const [name, event] of rejects) assert.equal(ok(event), null, name);
});

test("rejects one event's fields on another event", () => {
  const leaks: [string, unknown][] = [
    ["command on first_run", { ...firstRun, command: "init" }],
    ["exit_class on first_run", { ...firstRun, exit_class: "ok" }],
    ["duration on first_run", { ...firstRun, duration_ms: 10 }],
    ["block on first_run", { ...firstRun, block: "json-peek" }],
    ["scan totals on first_run", { ...firstRun, scan_scripts: 4 }],
    ["day on first_run", { ...firstRun, day: "2026-10-02" }],
    ["counter on first_run", { ...firstRun, runs: 3 }],
    ["map on first_run", { ...firstRun, harness_sessions: { claude: 1 } }],
    ["unknown-key map on first_run", { ...firstRun, first_party_runs: { "deploy-staging": 1 } }],
    ["day on command_run", { ...commandRun, day: "2026-10-02" }],
    ["counter on command_run", { ...commandRun, hints: 2 }],
    ["scripts_bytes on command_run", { ...commandRun, scripts_bytes: 100 }],
    ["map on command_run", { ...commandRun, first_party_runs: { "json-peek": 1 } }],
    ["command on daily_usage", { ...dailyUsage, command: "run" }],
    ["exit_class on daily_usage", { ...dailyUsage, exit_class: "ok" }],
    ["block on daily_usage", { ...dailyUsage, block: "json-peek" }],
    ["duration on daily_usage", { ...dailyUsage, duration_ms: 5 }],
    ["scan totals on daily_usage", { ...dailyUsage, scan_shapes: 2 }],
  ];
  for (const [name, event] of leaks) assert.equal(ok(event), null, name);
});

test("daily_usage day must be a real UTC day in [today - 8, today]", () => {
  const at = (day: unknown, now = NOW) => validateEvent({ ...dailyUsage, day }, now);
  assert.ok(at("2026-10-03"), "today");
  assert.ok(at("2026-09-25"), "today - 8");
  assert.equal(at("2026-09-24"), null, "today - 9");
  assert.equal(at("2026-10-04"), null, "tomorrow");
  // The window follows the UTC date of `now`, not its local time.
  assert.ok(at("2026-10-04", new Date("2026-10-04T00:00:00Z")), "just after UTC midnight");
  assert.equal(at("2026-10-04", new Date("2026-10-03T23:59:59.999Z")), null, "just before UTC midnight");
  assert.ok(at("2026-09-25", new Date("2026-10-03T23:59:59.999Z")));
  assert.equal(at("2026-09-25", new Date("2026-10-04T00:00:00Z")), null);
  // Leap days and month ends across the window.
  assert.ok(at("2028-02-29", new Date("2028-03-01T12:00:00Z")));
  for (const bad of ["2026-02-30", "2026-09-31", "2026-13-01", "2026-9-30", "2026-09-30T00:00:00Z", "20261002", "", 20261002]) {
    assert.equal(at(bad, new Date("2026-10-03T12:00:00Z")), null, `day ${JSON.stringify(bad)}`);
  }
});

// Days the Go client really produces (internal/telemetry/rollup_test.go and
// internal/runner): rejecting one loses it for good, because the client only
// sees the 202.
test("accepts honest days that look inconsistent", () => {
  // A hint shown before UTC midnight, followed after it: credited on the call's day.
  const crossMidnight = { ...base, event: "daily_usage", day: "2026-10-02", repos_active: 2, sessions: 4, hints_followed: 2, calls: 2, harness_sessions: { codex: 2 } };
  assert.equal(ok(crossMidnight)!.hints_followed, 2);
  // Unverified blocks get a marker added, so more bytes are returned than printed.
  const wrapped = { ...base, event: "daily_usage", day: "2026-10-02", repos_active: 1, runs: 3, runs_user: 3, blocks_user: 1, bytes_full: 36, bytes_returned: 93 };
  assert.equal(ok(wrapped)!.bytes_returned, 93);
  // One session seen under two harness names; scripts captured with no session id.
  assert.ok(ok({ ...base, event: "daily_usage", day: "2026-10-02", sessions: 2, harness_sessions: { claude: 2, codex: 2 } }));
  assert.ok(ok({ ...base, event: "daily_usage", day: "2026-10-02", scripts: 3 }));
  // The largest values one row may carry, on each side of the byte pair.
  const edge = ok({ ...dailyUsage, scripts: 2 ** 24 - 1, scripts_bytes: 2 ** 36 - 1, bytes_full: 2 ** 36 - 1, bytes_returned: 2 ** 36 - 1 })!;
  assert.equal(edge.scripts_bytes, 2 ** 36 - 1);
  assert.equal(edge.scripts, 2 ** 24 - 1);
  assert.equal(edge.bytes_full, 2 ** 36 - 1);
  assert.equal(edge.bytes_returned, 2 ** 36 - 1);
});
