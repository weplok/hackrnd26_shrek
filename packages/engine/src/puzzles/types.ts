// Puzzle plugin contract (TZ 7.4). One archetype = one directory in puzzles/, wired in the registry.
import type { Knobs } from '../content/types.gen.ts';
import { shuffle } from '../rng.ts';

export type { Knobs };

export interface PuzzleOption {
  id: string;
  label: string;
}

/** Generated puzzle data the UI renders; view holds archetype-specific extras (tables, graph, slots). */
export interface PuzzleBody {
  prompt: string;
  options: PuzzleOption[];
  multi: boolean; // select several options
  ordered: boolean; // order of selection matters (slots, path)
  correct: string[]; // option ids; in order when ordered
  view: Record<string, unknown>;
}

export interface VerifyResult {
  solved: boolean;
  mistakes: number;
}

export interface GenerateCtx {
  // false: the hypothesis vuln is not on this node; build a solvable instance from neutral data.
  genuine: boolean;
  label: (nodeId: string) => string;
}

export interface PuzzleLogic {
  archetype: string;
  generate(params: Record<string, unknown>, knobs: Knobs, rng: number, ctx: GenerateCtx): [number, PuzzleBody];
  verify(body: PuzzleBody, answer: string[]): VerifyResult;
  /** Noise units for a failed attempt; the engine scales them by difficulty.wrongGuessNoise. */
  noise(result: VerifyResult, knobs: Knobs): number;
  explainMismatch(body: PuzzleBody): string;
}

export const str = (p: Record<string, unknown>, key: string, fallback: string): string =>
  typeof p[key] === 'string' ? p[key] : fallback;

export const strs = (p: Record<string, unknown>, key: string, fallback: string[]): string[] => {
  const v = p[key];
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : fallback;
};

export const decoyCount = (knobs: Knobs, fallback = 3): number => Math.max(1, knobs.decoys ?? fallback);

/** Shuffle correct + decoy labels into options; correct ids keep the order of `good`. */
export function options(rng: number, good: string[], decoys: string[]): [number, PuzzleOption[], string[]] {
  const labels = [...new Set([...good, ...decoys])];
  const [next, shuffled] = shuffle(rng, labels);
  const opts = shuffled.map((label, i) => ({ id: `o${String(i)}`, label }));
  const idOf = (label: string) => opts.find((o) => o.label === label)?.id ?? '';
  return [next, opts, good.map(idOf)];
}

/** Unordered check: every wrong pick and every missed pick is a mistake. */
export function verifySet(body: PuzzleBody, answer: string[]): VerifyResult {
  const sel = new Set(answer);
  const cor = new Set(body.correct);
  const mistakes = [...sel].filter((x) => !cor.has(x)).length + [...cor].filter((x) => !sel.has(x)).length;
  return { solved: mistakes === 0 && sel.size > 0, mistakes };
}

/** Ordered check: each slot that differs, plus extra or missing slots, is a mistake. */
export function verifyOrdered(body: PuzzleBody, answer: string[]): VerifyResult {
  const len = Math.max(answer.length, body.correct.length);
  let mistakes = 0;
  for (let i = 0; i < len; i++) if (answer[i] !== body.correct[i]) mistakes += 1;
  return { solved: mistakes === 0 && answer.length > 0, mistakes };
}

export const mistakeNoise = (result: VerifyResult): number => (result.solved ? 0 : Math.max(1, result.mistakes));
