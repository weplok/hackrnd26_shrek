// Puzzle archetype generators. Each turns exploit.puzzleParams + knobs into a
// PuzzleInstance (visual metaphor of a real technique; no real commands).
import type { PuzzleInstance } from './types.ts';
import { shuffle } from './rng.ts';

interface Knobs {
  attempts?: number;
  decoys?: number;
  otpWindow?: number;
}

// Fields used by the archetype generators below; content may carry more.
interface PuzzleParams {
  answer?: string;
  decoys?: string[];
  credentials?: string;
  component?: string;
  sources?: string[];
  accounts?: string[];
  forgotten?: string;
}

export function generatePuzzle(
  rng: number,
  archetype: string,
  title: string,
  rawParams: object,
  knobs: Knobs | undefined,
  nodeId: string,
  vuln: string,
): [number, PuzzleInstance] {
  const params = rawParams as PuzzleParams;
  const nDecoys = knobs?.decoys ?? 3;
  let opts: { id: string; label: string }[] = [];
  let correct: string[] = [];
  let prompt = '';
  let multi = false;

  const mk = (label: string, i: number) => ({ id: `o${String(i)}`, label });

  switch (archetype) {
    case 'password-wheel': {
      prompt = 'Собери вероятный пароль из улик и выбери его.';
      const answer = params.answer ?? 'barsik123';
      const decoys: string[] = (params.decoys ?? ['qwerty123', 'admin1234', 'password1']).slice(0, nDecoys);
      const labels = [answer, ...decoys];
      let shuffled;
      [rng, shuffled] = shuffle(rng, labels);
      opts = shuffled.map((l, i) => mk(l, i));
      correct = opts.filter((o) => o.label === answer).map((o) => o.id);
      break;
    }
    case 'sticker': {
      prompt = 'На заводской наклейке — учётные данные. Выбери их.';
      const creds = params.credentials ?? 'admin/admin';
      const decoys = ['root/toor', 'user/1234', 'admin/password'].slice(0, nDecoys);
      let shuffled;
      [rng, shuffled] = shuffle(rng, [creds, ...decoys]);
      opts = shuffled.map((l, i) => mk(l, i));
      correct = opts.filter((o) => o.label === creds).map((o) => o.id);
      break;
    }
    case 'expired-patch': {
      prompt = 'Найди компонент старее бюллетеня безопасности.';
      const comp = params.component ?? 'portal-cms';
      const outdated = `${comp} v1.2 (2021)`;
      const decoys = ['auth-lib v4.0 (2026)', 'render v9.1 (2026)', 'db-driver v3.3 (2025)'].slice(0, nDecoys);
      let shuffled;
      [rng, shuffled] = shuffle(rng, [outdated, ...decoys]);
      opts = shuffled.map((l, i) => mk(l, i));
      correct = opts.filter((o) => o.label === outdated).map((o) => o.id);
      break;
    }
    case 'legend-mosaic': {
      prompt = 'Выбери плитки, которые складываются в правдоподобную легенду.';
      multi = true;
      const sources: string[] = params.sources ?? ['about_page', 'mail_headers', 'dept_pages'];
      const labelBy: Record<string, string> = {
        about_page: 'Страница «о нас»: имена',
        mail_headers: 'Формат корпоративной почты',
        dept_pages: 'Структура кафедр/отделов',
      };
      const good = sources.map((s) => labelBy[s] ?? s);
      const decoys = ['Цены из прайса', 'Фото со стенда', 'Расписание звонков'].slice(0, nDecoys);
      let shuffled;
      [rng, shuffled] = shuffle(rng, [...good, ...decoys]);
      opts = shuffled.map((l, i) => mk(l, i));
      correct = opts.filter((o) => good.includes(o.label)).map((o) => o.id);
      break;
    }
    case 'forgotten-key': {
      prompt = 'Среди учёток найди забытую тестовую/сервисную.';
      const accounts: string[] = params.accounts ?? ['ivanova', 'test_svc', 'temp_backup'];
      const forgotten = params.forgotten ?? 'test_svc';
      let shuffled;
      [rng, shuffled] = shuffle(rng, accounts);
      opts = shuffled.map((l, i) => mk(l, i));
      correct = opts.filter((o) => o.label === forgotten).map((o) => o.id);
      break;
    }
    case 'wall': {
      prompt = 'В сетке правил межсетевого экрана найди щель.';
      const rules = ['allow 443 → web', 'deny 22 → *', 'allow any → any (ошибка!)', 'deny 3389 → *'];
      const gap = 'allow any → any (ошибка!)';
      let shuffled;
      [rng, shuffled] = shuffle(rng, rules);
      opts = shuffled.map((l, i) => mk(l, i));
      correct = opts.filter((o) => o.label === gap).map((o) => o.id);
      break;
    }
    case 'trust-path': {
      prompt = 'Проложи путь по доверенным связям к цели.';
      const good = 'ПК Антона → Контроллер (доверенная связь)';
      const decoys = ['Гостевой Wi-Fi → Контроллер', 'Принтер → Контроллер', 'Портал → Контроллер'].slice(0, nDecoys);
      let shuffled;
      [rng, shuffled] = shuffle(rng, [good, ...decoys]);
      opts = shuffled.map((l, i) => mk(l, i));
      correct = opts.filter((o) => o.label === good).map((o) => o.id);
      break;
    }
    default: {
      prompt = 'Выбери верный вариант.';
      let shuffled;
      [rng, shuffled] = shuffle(rng, ['Верно', 'Неверно A', 'Неверно B']);
      opts = shuffled.map((l, i) => mk(l, i));
      correct = opts.filter((o) => o.label === 'Верно').map((o) => o.id);
    }
  }

  const inst: PuzzleInstance = { nodeId, vuln, archetype, title, prompt, options: opts, multi, correct };
  return [rng, inst];
}

export function verifyPuzzle(inst: PuzzleInstance, selected: string[]): boolean {
  const sel = [...selected].sort().join('|');
  const cor = [...inst.correct].sort().join('|');
  return sel === cor && selected.length > 0;
}
