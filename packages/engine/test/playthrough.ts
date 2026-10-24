// Headless playthrough: proves L1C1 and L2C1 are completable through the engine.
// Run from repo root: node --experimental-strip-types packages/engine/test/playthrough.ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { buildContent } from "../src/load.ts";
import * as E from "../src/index.ts";
import type { Content, GameState } from "../src/index.ts";

const ROOT = join(import.meta.dirname, "../../../content");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith(".json")) acc.push(p);
  }
  return acc;
}
function loadContent(): Content {
  const files: Record<string, any> = {};
  for (const p of walk(ROOT)) {
    const rel = relative(ROOT, p).replace(/\\/g, "/");
    if (rel.startsWith("schemas/")) continue;
    files[rel] = JSON.parse(readFileSync(p, "utf-8"));
  }
  return buildContent(files);
}

const content = loadContent();
let failures = 0;
function assert(cond: boolean, msg: string) { if (!cond) { console.log("  x FAIL:", msg); failures++; } }
function solve(s: GameState): GameState {
  if (!s.activePuzzle) throw new Error("no active puzzle");
  return E.submitPuzzle(content, s, s.activePuzzle.correct);
}

console.log("L1C1:");
{
  let s = E.createGame(content, "L1C1", content.campaign.levels[0].difficulty, 777);
  s = E.startCase(content, s);
  s = E.scan(content, s, "wifi");
  s = E.scan(content, s, "speaker");
  s = E.hypothesize(content, s, "wifi", "SL-02");
  s = solve(s);
  assert(s.phase === "report", "report phase reached");
  s = E.answerReport(content, s, "f_wifi", "o_pass");
  s = E.answerReport(content, s, "f_router", "o_admin");
  assert(s.phase === "won", "L1C1 WON");
  console.log(`  phase=${s.phase} rank=${s.rank} ticks=${s.tick} maxAlarm=${s.maxAlarm}`);
}

console.log("L2C1:");
{
  let s = E.createGame(content, "L2C1", content.campaign.levels[1].difficulty, 4242);
  s = E.startCase(content, s);
  s = E.scan(content, s, "guest_wifi");
  s = E.hypothesize(content, s, "guest_wifi", "SL-02"); s = solve(s);
  s = E.scan(content, s, "mail");
  s = E.hypothesize(content, s, "mail", "SL-05"); s = solve(s);
  s = E.combine(content, s, ["mail_format", "dept_list"]);
  s = E.present(content, s, "kostya", "friendly", []);
  s = E.scan(content, s, "teacher_pc");
  s = E.hypothesize(content, s, "teacher_pc", "SL-07"); s = solve(s);
  s = E.scan(content, s, "gateway");
  s = E.hypothesize(content, s, "gateway", "SL-08"); s = solve(s);
  s = E.present(content, s, "anton", "flattery", []);
  s = E.scan(content, s, "controller");
  s = E.hypothesize(content, s, "controller", "SL-06"); s = solve(s);
  s = E.combine(content, s, ["controller_token", "anton_vouch"]);
  s = E.present(content, s, "marina", "friendly", []);
  s = E.combine(content, s, ["marina_phrase", "legend_it"]);
  s = E.fillSocket(content, s, "base_dean", "sock_tech");
  s = E.fillSocket(content, s, "base_dean", "sock_human");
  assert(s.phase === "report", "report phase reached");
  for (const f of content.cases.L2C1.report.findings) {
    const correct = (f.options as any[]).find((o) => o.correct).id;
    s = E.answerReport(content, s, f.id, correct);
  }
  assert(s.phase === "won", "L2C1 WON");
  console.log(`  phase=${s.phase} rank=${s.rank} ticks=${s.tick} maxAlarm=${s.maxAlarm} codex=${Object.keys(s.codex).length}`);
}

console.log(failures === 0 ? "\nALL PLAYTHROUGHS PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
