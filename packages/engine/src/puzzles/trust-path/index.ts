// SL-06 Trust path (FR-045): lay the hop-by-hop path over trusted links; extra hops are noise.
import { type PuzzleLogic, decoyCount, mistakeNoise, options, strs, verifyOrdered } from '../types.ts';

const UNTRUSTED = ['Гостевой Wi-Fi', 'Принтер', 'Камера у входа', 'Киоск в холле'];

export const trustPath: PuzzleLogic = {
  archetype: 'trust-path',
  generate(params, knobs, rng, ctx) {
    const path = strs(params, 'trustPath', ['workstation', 'server']).map(ctx.label);
    const decoys = UNTRUSTED.filter((d) => !path.includes(d)).slice(0, decoyCount(knobs));
    const target = path[path.length - 1] ?? '';
    const edges = [
      ...path.slice(1).map((to, i) => ({ from: path[i] ?? '', to, trusted: true })),
      ...decoys.map((from) => ({ from, to: target, trusted: false })),
    ];
    const [next, opts, correct] = options(rng, path, decoys);
    return [
      next,
      {
        prompt: 'Проложи путь к цели по доверенным связям, узел за узлом.',
        options: opts,
        multi: true,
        ordered: true,
        correct,
        view: { edges },
      },
    ];
  },
  verify: verifyOrdered,
  noise: mistakeNoise,
  explainMismatch: () => 'Путь доверия проложен, но к этому узлу он не ведёт.',
};
