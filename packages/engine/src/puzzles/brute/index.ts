import { type PuzzleLogic, decoyCount, knob, mistakeNoise, options, str, strs, verifyOrdered } from '../types.ts';

const fragments = (value: string): string[] => value.match(/[a-zа-яё]+|\d+/gi) ?? [value];

export const brute: PuzzleLogic = {
  archetype: 'brute',
  generate(params, knobs, rng) {
    const good = fragments(str(params, 'answer', 'welcome2026'));
    const junk = strs(params, 'decoys', ['qwerty123', 'admin1234', 'password1'])
      .slice(0, decoyCount(knobs))
      .flatMap(fragments)
      .filter((item) => !good.includes(item));
    const [next, opts, correct] = options(rng, good, junk);
    return [
      next,
      {
        prompt: 'Прыгай по платформам-словам и собери пароль снизу вверх. Мусорная платформа крошится.',
        options: opts,
        multi: true,
        ordered: true,
        correct,
        view: { clues: strs(params, 'clues', []), towerHeight: knob(knobs, 'towerHeight', good.length), junkShare: knob(knobs, 'junkShare', 40) },
      },
    ];
  },
  verify: verifyOrdered,
  noise: mistakeNoise,
  explainMismatch: () => 'Собранный пароль не открывает этот вход.',
};
