import { nextInt, shuffle } from '../../rng.ts';
import { type PuzzleLogic, strs, verifySet } from '../types.ts';

const PHANTOMS = ['138/udp', '445/tcp', '1900/udp', '8081/tcp', '31337/tcp'];
const SLOTS = [18, 50, 82];

const port = (label: string): string => label.replace(/^эхо:\s*/, '');

export const scan: PuzzleLogic = {
  archetype: 'scan',
  generate(params, _knobs, rng) {
    const ports = strs(params, 'ports', ['443/tcp']).map(port);
    let s = rng;
    let r: number;
    [s, r] = nextInt(s);
    const good = ports[r % ports.length] ?? '443/tcp';
    let phantoms: string[];
    [s, phantoms] = shuffle(s, PHANTOMS.filter((p) => !ports.includes(p)));
    let labels: string[];
    [s, labels] = shuffle(s, [good, ...phantoms.slice(0, 2)]);
    const opts = labels.map((label, i) => ({ id: `o${String(i)}`, label }));
    const peaks = opts.map((o, i) => {
      [s, r] = nextInt(s);
      return { id: o.id, label: o.label, x: (SLOTS[i] ?? 50) + ((r % 9) - 4), height: 55 + (r % 40) };
    });
    return [
      s,
      {
        prompt: 'Наведи ползунок на пик сигнала и отправь. Только один порт отвечает по-настоящему.',
        options: opts,
        multi: false,
        ordered: false,
        correct: [opts[labels.indexOf(good)]?.id ?? ''],
        view: { peaks, target: params.target ?? '' },
      },
    ];
  },
  verify: verifySet,
  // misses are free: the player retries until the right port; leaving the tool is what costs noise
  noise: () => 0,
  explainMismatch: () => 'Этот порт молчит. Попробуй другой пик.',
};
