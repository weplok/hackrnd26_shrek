// SL-01 Sticker (FR-046): find the device model in the handbook and pick its factory pair.
import { shuffle } from '../../rng.ts';
import { type PuzzleLogic, decoyCount, mistakeNoise, options, str, verifySet } from '../types.ts';

const HANDBOOK: [string, string][] = [
  ['RT-300', 'admin/admin'],
  ['HX-20', 'root/toor'],
  ['LinkBox 5', 'user/1234'],
  ['NetCam K1', 'admin/password'],
  ['PrintJet 7', 'support/support'],
  ['AP-12', 'guest/guest'],
];

export const sticker: PuzzleLogic = {
  archetype: 'sticker',
  generate(params, knobs, rng) {
    const creds = str(params, 'credentials', 'admin/admin');
    const model = str(params, 'model', 'RT-300');
    let others: [string, string][];
    [rng, others] = shuffle(
      rng,
      HANDBOOK.filter(([m, c]) => m !== model && c !== creds),
    );
    const decoys = others.slice(0, decoyCount(knobs));
    let handbook: [string, string][];
    [rng, handbook] = shuffle(rng, [[model, creds], ...decoys]);
    const [next, opts, correct] = options(
      rng,
      [creds],
      decoys.map(([, c]) => c),
    );
    return [
      next,
      {
        prompt: 'На наклейке модель устройства. Найди её в справочнике и выбери заводскую пару.',
        options: opts,
        multi: false,
        ordered: false,
        correct,
        view: { device: model, handbook: handbook.map(([m, pair]) => ({ model: m, pair })) },
      },
    ];
  },
  verify: verifySet,
  noise: mistakeNoise,
  explainMismatch: () => 'Заводская пара не подошла: здесь её уже сменили.',
};
