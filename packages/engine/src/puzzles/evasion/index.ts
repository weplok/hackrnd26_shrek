import { type PuzzleLogic, decoyCount, knob, mistakeNoise, options, strs, verifyOrdered } from '../types.ts';

const DETOURS = ['через гостевой туннель', 'через камеру', 'через принтер', 'через общий доступ'];

export const evasion: PuzzleLogic = {
  archetype: 'evasion',
  generate(params, knobs, rng, ctx) {
    const path = strs(params, 'path', strs(params, 'trustPath', ['workstation', 'server'])).map(ctx.label);
    const decoys = DETOURS.filter((item) => !path.includes(item)).slice(0, decoyCount(knobs));
    const [next, opts, correct] = options(rng, path, decoys);
    return [
      next,
      {
        prompt: 'Разрежь трафик и проведи фрагменты через зазоры между лучами СОВ.',
        options: opts,
        multi: true,
        ordered: true,
        correct,
        view: { beamCount: knob(knobs, 'beamCount', 3), gapWidth: knob(knobs, 'gapWidth', 2) },
      },
    ];
  },
  verify: verifyOrdered,
  noise: mistakeNoise,
  explainMismatch: () => 'Фрагменты задели луч трассировки.',
};
