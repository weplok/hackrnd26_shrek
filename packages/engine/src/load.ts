// Build the indexed Content object from a flat map of {contentRelPath: json}.
// Host-agnostic: the web app fills `files` via Vite glob; tests via fs.
import type { Content } from "./types.ts";

export function buildContent(files: Record<string, any>): Content {
  const cases: Content["cases"] = {};
  const codex: Content["codex"] = {};
  const npcs: Content["npcs"] = {};
  for (const [path, json] of Object.entries(files)) {
    if (path.startsWith("cases/")) cases[json.id] = json;
    else if (path.startsWith("catalog/codex/")) codex[json.id] = json;
    else if (path.startsWith("npc/")) npcs[json.npc] = json;
  }
  const vulnerabilities: Content["vulnerabilities"] = {};
  for (const v of files["catalog/vulnerabilities.json"]?.items ?? []) vulnerabilities[v.id] = v;
  const puzzles: Content["puzzles"] = {};
  for (const p of files["catalog/puzzles.json"]?.items ?? []) puzzles[p.vuln] = { archetype: p.archetype, title: p.title };
  const consequences: Content["consequences"] = {};
  for (const c of files["consequences.json"]?.items ?? []) consequences[c.id] = c;
  return {
    campaign: files["campaign.json"],
    cases, codex, vulnerabilities, puzzles, npcs, consequences,
    flipper: files["flipper.json"],
    interludes: files["interludes.json"],
  };
}
