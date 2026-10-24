// SL-05 Legend mosaic (FR-042): pick the consistent set of OSINT tiles; false tiles contradict the rest.
import { type PuzzleLogic, decoyCount, mistakeNoise, options, strs, verifySet } from '../types.ts';

const TILES: Record<string, string> = {
  about_page: 'Страница «о нас»: имена',
  mail_headers: 'Формат корпоративной почты',
  dept_pages: 'Структура кафедр/отделов',
  social: 'Публичные посты сотрудников',
  news: 'Новости организации',
};

const CONFLICTING = [
  'Подпись отдела, которого нет в структуре',
  'Адрес почты в чужом формате',
  'Имя сотрудника, уволенного год назад',
  'Должность из другой организации',
];

export const legendMosaic: PuzzleLogic = {
  archetype: 'legend-mosaic',
  generate(params, knobs, rng) {
    const sources = strs(params, 'sources', ['about_page', 'news']);
    const good = sources.map((s) => TILES[s] ?? s);
    const [next, opts, correct] = options(rng, good, CONFLICTING.slice(0, decoyCount(knobs)));
    return [
      next,
      {
        prompt: 'Открой плитки и выбери набор, который складывается в непротиворечивую легенду.',
        options: opts,
        multi: true,
        ordered: false,
        correct,
        view: { sources },
      },
    ];
  },
  verify: verifySet,
  noise: mistakeNoise,
  explainMismatch: () => 'Легенда сложилась, но здесь некого ею убеждать.',
};
