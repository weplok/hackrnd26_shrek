import type { PuzzleInstance } from '@zero-day/engine';

export type GameProps = {
  puzzle: PuzzleInstance;
  onCancel: () => void;
  onSubmit: (answer: string[]) => void;
};

/** Stable per-puzzle random source so a reopened tool shows the same lock or picture. */
export function seeded(puzzle: PuzzleInstance): () => number {
  const key = `${puzzle.nodeId}:${puzzle.vuln}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
