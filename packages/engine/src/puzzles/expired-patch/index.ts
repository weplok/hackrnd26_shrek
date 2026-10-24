// SL-04 Expired patch (FR-041): match components against the bulletin and find the one behind its fix.
import { shuffle } from '../../rng.ts';
import { type PuzzleLogic, decoyCount, mistakeNoise, options, str, verifySet } from '../types.ts';

interface Row {
  component: string;
  version: string;
  date: string;
  fixedIn: string;
}

const UP_TO_DATE: Row[] = [
  { component: 'auth-lib', version: '4.0', date: '2026-02', fixedIn: '3.8' },
  { component: 'render', version: '9.1', date: '2026-01', fixedIn: '9.0' },
  { component: 'db-driver', version: '3.3', date: '2025-11', fixedIn: '3.3' },
  { component: 'mailer', version: '2.5', date: '2025-09', fixedIn: '2.1' },
  { component: 'search', version: '7.0', date: '2026-04', fixedIn: '6.4' },
];

const label = (r: Row) => `${r.component} v${r.version} (${r.date})`;

export const expiredPatch: PuzzleLogic = {
  archetype: 'expired-patch',
  generate(params, knobs, rng) {
    const target: Row = {
      component: str(params, 'component', 'print-spooler'),
      version: '1.2',
      date: '2021-06',
      fixedIn: '2.0',
    };
    let pool: Row[];
    [rng, pool] = shuffle(
      rng,
      UP_TO_DATE.filter((r) => r.component !== target.component),
    );
    let rows: Row[];
    [rng, rows] = shuffle(rng, [target, ...pool.slice(0, decoyCount(knobs))]);
    const [next, opts, correct] = options(rng, [label(target)], rows.filter((r) => r !== target).map(label));
    return [
      next,
      {
        prompt: 'Сверь компоненты с бюллетенем безопасности и найди тот, что старше исправления.',
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
  explainMismatch: () => 'Устаревший компонент найден, но этот узел держится не на нём.',
};
