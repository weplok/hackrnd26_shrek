// SL-07 Forgotten key (FR-043): read account attributes and pick the abandoned one.
import { shuffle } from '../../rng.ts';
import { type PuzzleLogic, mistakeNoise, options, str, strs, verifySet } from '../types.ts';

const CREATED = ['2023-02', '2024-09', '2025-01', '2025-06'];
const RECENT = ['вчера', '3 дня назад', 'неделю назад', 'сегодня'];

export const forgottenKey: PuzzleLogic = {
  archetype: 'forgotten-key',
  generate(params, _knobs, rng) {
    const accounts = strs(params, 'accounts', ['petrova', 'svc_backup', 'sidorov']);
    const forgotten = str(params, 'forgotten', accounts[1] ?? 'svc_backup');
    let created: string[], recent: string[];
    [rng, created] = shuffle(rng, CREATED);
    [rng, recent] = shuffle(rng, RECENT);
    const rows = accounts.map((name, i) =>
      name === forgotten
        ? { name, created: '2019-09', lastLogin: '2020-01', owner: '—' }
        : { name, created: created[i % created.length], lastLogin: recent[i % recent.length], owner: name },
    );
    const [next, opts, correct] = options(
      rng,
      [forgotten],
      accounts.filter((a) => a !== forgotten),
    );
    return [
      next,
      {
        prompt: 'Среди учёток найди забытую: без владельца и давно без входа.',
        options: opts,
        multi: false,
        ordered: false,
        correct,
        view: { rows },
      },
    ];
  },
  verify: verifySet,
  noise: mistakeNoise,
  explainMismatch: () => 'Забытая учётка нашлась, но доступа к этому узлу она не даёт.',
};
