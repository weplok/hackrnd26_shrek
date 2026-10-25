// Loads the repo /content tree from disk into the flat {relPath: json} map
// buildContent expects — the Node-side mirror of apps/web/src/content.ts.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContent } from '@zero-day/engine';
import type { Content } from '@zero-day/engine';

const here = fileURLToPath(new URL('.', import.meta.url));
const CONTENT_DIR = join(here, '../../../content');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

const files: Record<string, unknown> = {};
for (const full of walk(CONTENT_DIR)) {
  const rel = relative(CONTENT_DIR, full).split('\\').join('/');
  if (rel.startsWith('schemas/')) continue;
  files[rel] = JSON.parse(readFileSync(full, 'utf8'));
}

export const content: Content = buildContent(files);
