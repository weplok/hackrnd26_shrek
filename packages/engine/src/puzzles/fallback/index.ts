// Placeholder for archetypes without a plugin yet (03, 09-13): a plain single choice.
import { type PuzzleLogic, mistakeNoise, options, verifySet } from '../types.ts';

export const DEFAULT_FAIL_HINT = 'Узел не поддался: приём не подошёл.';

export const fallback: PuzzleLogic = {
  archetype: 'default',
  generate(_params, _knobs, rng) {
    const [next, opts, correct] = options(rng, ['Верно'], ['Неверно A', 'Неверно B']);
    return [next, { prompt: 'Выбери верный вариант.', options: opts, multi: false, ordered: false, correct, view: {} }];
  },
  verify: verifySet,
  noise: mistakeNoise,
  explainMismatch: () => DEFAULT_FAIL_HINT,
};
