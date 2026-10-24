// Puzzle registry (TZ 7.4): built from explicit imports, one entry per archetype directory.
import type { PuzzleInstance } from '../types.ts';
import { type GenerateCtx, type Knobs, type PuzzleLogic, type VerifyResult } from './types.ts';
import { scan } from './scan/index.ts';
import { exploit } from './exploit/index.ts';
import { brute } from './brute/index.ts';
import { phish } from './phish/index.ts';
import { evasion } from './evasion/index.ts';
import { crypto } from './crypto/index.ts';
import { rootkit } from './rootkit/index.ts';
import { wipe } from './wipe/index.ts';
import { fallback } from './fallback/index.ts';

export type { PuzzleLogic, PuzzleBody, PuzzleOption, VerifyResult, GenerateCtx } from './types.ts';
export { DEFAULT_FAIL_HINT } from './fallback/index.ts';

export const PUZZLES: Record<string, PuzzleLogic> = Object.fromEntries(
  [scan, exploit, brute, phish, evasion, crypto, rootkit, wipe].map((p) => [p.archetype, p]),
);

export function puzzleLogic(archetype: string): PuzzleLogic {
  return PUZZLES[archetype] ?? fallback;
}

export function generatePuzzle(
  rng: number,
  archetype: string,
  title: string,
  params: Record<string, unknown>,
  knobs: Knobs,
  nodeId: string,
  vuln: string,
  ctx: GenerateCtx = { genuine: true, label: (id) => id },
  action: PuzzleInstance['action'] = 'exploit',
): [number, PuzzleInstance] {
  const [next, body] = puzzleLogic(archetype).generate(params, knobs, rng, ctx);
  const attemptsLeft = Math.max(1, knobs.attempts ?? 3);
  return [next, { ...body, nodeId, vuln, archetype, title, genuine: ctx.genuine, knobs, attemptsLeft, action }];
}

export function checkPuzzle(inst: PuzzleInstance, answer: string[]): VerifyResult {
  return puzzleLogic(inst.archetype).verify(inst, answer);
}

export function verifyPuzzle(inst: PuzzleInstance, answer: string[]): boolean {
  return checkPuzzle(inst, answer).solved;
}
