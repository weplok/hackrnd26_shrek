import { type PuzzleLogic, decoyCount, knob, mistakeNoise, options, strs, verifyOrdered } from '../types.ts';

const DEFAULT_BLOCKS = ['Легенда: IT-подрядчик', 'Зацепка: заявка №17', 'Тон: спокойно и по делу'];
const DISTRACTORS = ['Легенда: срочный начальник', 'Зацепка: неизвестный подарок', 'Тон: давить и торопить', 'Тон: слишком дружелюбно'];

export const phish: PuzzleLogic = {
  archetype: 'phish',
  generate(params, knobs, rng) {
    const good = strs(params, 'blocks', strs(params, 'sources', DEFAULT_BLOCKS)).slice(0, knob(knobs, 'blockCount', 3));
    const [next, opts, correct] = options(rng, good, DISTRACTORS.slice(0, decoyCount(knobs)));
    return [
      next,
      {
        prompt: 'Собери письмо из легенды, зацепки и подходящего тона. Доверие меняется после отправки.',
        options: opts,
        multi: true,
        ordered: true,
        correct,
        view: { trustSensitivity: knob(knobs, 'trustSensitivity', 2), slots: good.length },
      },
    ];
  },
  verify: verifyOrdered,
  noise: mistakeNoise,
  explainMismatch: () => 'Письмо выглядит неубедительно.',
};
