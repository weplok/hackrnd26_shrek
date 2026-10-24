import { type PuzzleLogic, decoyCount, knob, mistakeNoise, options, strs, verifySet } from '../types.ts';

const OWN = ['auth: тестовая сессия', 'proxy: учебный маршрут', 'audit: проверка разрешения'];
const SYSTEM = ['kernel: плановая задача', 'dns: кэш обновлён', 'backup: контрольная точка', 'mail: очередь доставлена'];

export const wipe: PuzzleLogic = {
  archetype: 'wipe',
  generate(params, knobs, rng) {
    const own = strs(params, 'ownLines', OWN).slice(0, knob(knobs, 'ownLines', 2));
    const [next, opts, correct] = options(rng, own, strs(params, 'systemLines', SYSTEM).slice(0, decoyCount(knobs)));
    return [
      next,
      {
        prompt: 'Затри только свои подсвеченные следы. Системную строку трогать нельзя.',
        options: opts,
        multi: true,
        ordered: false,
        correct,
        view: { errorPenalty: knob(knobs, 'errorPenalty', 2) },
      },
    ];
  },
  verify: verifySet,
  noise: mistakeNoise,
  explainMismatch: () => 'Затёрта системная запись: корреляция выросла.',
};
