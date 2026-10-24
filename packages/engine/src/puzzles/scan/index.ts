import { type PuzzleLogic, knob, mistakeNoise, options, strs, verifySet } from '../types.ts';

const PHANTOMS = ['эхо: 138/udp', 'эхо: 445/tcp', 'эхо: 1900/udp', 'эхо: 8081/tcp', 'эхо: 31337/tcp'];

export const scan: PuzzleLogic = {
  archetype: 'scan',
  generate(params, knobs, rng) {
    const ports = strs(params, 'ports', ['эхо: 443/tcp', 'эхо: 53/udp']);
    const falseEchoes = knob(knobs, 'falseEchoes', knobs.decoys ?? 2);
    const [next, opts, correct] = options(rng, ports, PHANTOMS.slice(0, falseEchoes));
    return [
      next,
      {
        prompt: 'Пусти импульс и отметь устойчивые эхо-точки. Ложные вспышки затухнут после следующего хода.',
        options: opts,
        multi: true,
        ordered: false,
        correct,
        view: { defense: params.defense ?? 'пассивный фильтр', fadeSteps: knob(knobs, 'fadeSteps', 1), target: params.target ?? '' },
      },
    ];
  },
  verify: verifySet,
  noise: mistakeNoise,
  explainMismatch: () => 'Эхо не совпало с картой узла.',
};
