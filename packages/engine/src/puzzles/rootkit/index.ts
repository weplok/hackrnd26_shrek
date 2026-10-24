import { type PuzzleLogic, decoyCount, knob, mistakeNoise, options, strs, verifyOrdered } from '../types.ts';

const DEFAULT_PROFILE = ['Процессор: 20%', 'Сеть: 10%', 'Файлы: 5%'];
const NOISY = ['Процессор: 95%', 'Сеть: 80%', 'Файлы: 60%', 'Память: 90%'];

export const rootkit: PuzzleLogic = {
  archetype: 'rootkit',
  generate(params, knobs, rng) {
    const count = knob(knobs, 'parameterCount', 3);
    const good = strs(params, 'profile', strs(params, 'accounts', DEFAULT_PROFILE)).slice(0, count);
    const [next, opts, correct] = options(rng, good, NOISY.slice(0, decoyCount(knobs)));
    return [
      next,
      {
        prompt: 'Подгони поведенческий профиль под легитимный до порога EDR.',
        options: opts,
        multi: true,
        ordered: true,
        correct,
        view: { parameterCount: count, edrThreshold: knob(knobs, 'edrThreshold', 75) },
      },
    ];
  },
  verify: verifyOrdered,
  noise: mistakeNoise,
  explainMismatch: () => 'Профиль не прошёл порог EDR.',
};
