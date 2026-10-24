// Loads repo content/ into the engine's indexed Content for tests.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildContent } from '../src/load.ts';
import type { Content } from '../src/index.ts';

const ROOT = join(import.meta.dirname, '../../../content');

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith('.json')) acc.push(p);
  }
  return acc;
}

export function loadContent(): Content {
  const files: Record<string, unknown> = {};
  for (const p of walk(ROOT)) {
    const rel = relative(ROOT, p).replace(/\\/g, '/');
    if (rel.startsWith('schemas/')) continue;
    files[rel] = JSON.parse(readFileSync(p, 'utf-8')) as unknown;
  }
  return buildContent(files);
}
