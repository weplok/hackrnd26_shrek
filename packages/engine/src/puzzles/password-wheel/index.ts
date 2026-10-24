// SL-02 Password wheel (FR-040): put clue fragments into the password slots in order; limited attempts.
import { type PuzzleLogic, decoyCount, mistakeNoise, options, str, strs, verifyOrdered } from '../types.ts';

const fragments = (s: string): string[] => s.match(/[a-zа-яё]+|\d+/gi) ?? [s];

export const passwordWheel: PuzzleLogic = {
  archetype: 'password-wheel',
  generate(params, knobs, rng) {
    const good = fragments(str(params, 'answer', 'welcome2026'));
    const decoys = strs(params, 'decoys', ['qwerty123', 'admin1234', 'password1'])
      .slice(0, decoyCount(knobs))
      .flatMap(fragments)
      .filter((f) => !good.includes(f));
    const [next, opts, correct] = options(rng, good, decoys);
    return [
      next,
      {
        prompt: 'Расставь фрагменты из улик по слотам пароля.',
        options: opts,
        multi: true,
        ordered: true,
        correct,
        view: { slots: good.length, clues: strs(params, 'clues', []) },
      },
    ];
  },
  verify: verifyOrdered,
  noise: mistakeNoise,
  explainMismatch: () => 'Пароль собран, но этот вход им не защищён.',
};
