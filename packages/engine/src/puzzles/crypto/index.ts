import { type PuzzleLogic, decoyCount, knob, mistakeNoise, options, strs, verifyOrdered } from '../types.ts';

const DEFAULT_ROTORS = ['Ротор A: 7', 'Ротор B: 3', 'Ротор C: 9'];
const FALSE_ROTORS = ['Ротор A: 1', 'Ротор B: 8', 'Ротор C: 4', 'Ротор D: 6'];

export const crypto: PuzzleLogic = {
  archetype: 'crypto',
  generate(params, knobs, rng) {
    const rotorCount = knob(knobs, 'rotorCount', 3);
    const good = strs(params, 'rotors', DEFAULT_ROTORS).slice(0, rotorCount);
    const [next, opts, correct] = options(rng, good, FALSE_ROTORS.slice(0, decoyCount(knobs)));
    return [
      next,
      {
        prompt: 'Поверни роторы по подсказкам и совмести засечки шифр-диска.',
        options: opts,
        multi: true,
        ordered: true,
        correct,
        view: { rotorCount, hintCount: knob(knobs, 'hintCount', 2) },
      },
    ];
  },
  verify: verifyOrdered,
  noise: mistakeNoise,
  explainMismatch: () => 'Засечки не сошлись: ключ не получен.',
};
