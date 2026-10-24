import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'json-schema-to-typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const schemasDir = join(root, 'content/schemas');
const outFile = join(root, 'packages/engine/src/content/types.gen.ts');

const files = (await readdir(schemasDir))
  .filter((f) => f.endsWith('.schema.json') && f !== 'common.schema.json')
  .sort();

// One bundle schema so shared definitions are emitted once instead of per file.
const bundle = /** @type {Parameters<typeof compile>[0]} */ ({
  title: 'Content',
  type: 'object',
  properties: Object.fromEntries(files.map((f) => [f.replace('.schema.json', ''), { $ref: f }])),
  additionalProperties: false,
});

const ts = await compile(bundle, 'Content', {
  cwd: schemasDir,
  bannerComment: '/* Generated from content/schemas by `pnpm codegen`. Do not edit. */',
  additionalProperties: false,
  unreachableDefinitions: false,
  ignoreMinAndMaxItems: true,
});
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, ts);
console.log(`wrote ${outFile}`);
