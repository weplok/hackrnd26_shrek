// Build the indexed Content object from a flat map of {contentRelPath: json}.
// Host-agnostic: the web app fills `files` via Vite glob; tests via fs.
// Files are trusted to match content/schemas: content-tools validates them in CI.
import type { Content, Campaign, Case, CodexCard, Flipper, Interludes, NpcConfig } from './types.ts';
import type { Consequences, Puzzles, Vulnerabilities } from './content/types.gen.ts';

export function buildContent(files: Record<string, unknown>): Content {
  const cases: Content['cases'] = {};
  const codex: Content['codex'] = {};
  const npcs: Content['npcs'] = {};
  for (const [path, json] of Object.entries(files)) {
    if (path.startsWith('cases/')) {
      const c = json as Case;
      cases[c.id] = c;
    } else if (path.startsWith('catalog/codex/')) {
      const card = json as CodexCard;
      codex[card.id] = card;
    } else if (path.startsWith('npc/')) {
      const npc = json as NpcConfig;
      npcs[npc.npc] = npc;
    }
  }
  const vulnerabilities: Content['vulnerabilities'] = {};
  for (const v of (files['catalog/vulnerabilities.json'] as Vulnerabilities | undefined)?.items ?? [])
    vulnerabilities[v.id] = v;
  const puzzles: Content['puzzles'] = {};
  for (const p of (files['catalog/puzzles.json'] as Puzzles | undefined)?.items ?? [])
    puzzles[p.vuln] = { archetype: p.archetype, title: p.title };
  const consequences: Content['consequences'] = {};
  for (const c of (files['consequences.json'] as Consequences | undefined)?.items ?? []) consequences[c.id] = c;
  return {
    campaign: files['campaign.json'] as Campaign,
    cases,
    codex,
    vulnerabilities,
    puzzles,
    npcs,
    consequences,
    flipper: files['flipper.json'] as Flipper,
    interludes: files['interludes.json'] as Interludes,
  };
}
