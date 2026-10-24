// SL-08 Wall (FR-044): find the allow rule that opens a gap in the firewall grid.
import { shuffle } from '../../rng.ts';
import { type PuzzleLogic, decoyCount, mistakeNoise, options, verifySet } from '../types.ts';

interface Rule {
  action: 'allow' | 'deny';
  src: string;
  dst: string;
  service: string;
}

const GAP: Rule = { action: 'allow', src: 'any', dst: 'admin', service: 'any' };
const SOUND: Rule[] = [
  { action: 'allow', src: 'student', dst: 'web', service: '443' },
  { action: 'deny', src: 'any', dst: 'admin', service: '22' },
  { action: 'deny', src: 'student', dst: 'admin', service: '3389' },
  { action: 'allow', src: 'admin', dst: 'db', service: '5432' },
  { action: 'deny', src: 'guest', dst: 'any', service: 'any' },
  { action: 'allow', src: 'any', dst: 'dns', service: '53' },
];

const label = (r: Rule) => `${r.action} ${r.src} → ${r.dst} : ${r.service}`;

export const wall: PuzzleLogic = {
  archetype: 'wall',
  generate(_params, knobs, rng) {
    let pool: Rule[];
    [rng, pool] = shuffle(rng, SOUND);
    const sound = pool.slice(0, decoyCount(knobs));
    let rules: Rule[];
    [rng, rules] = shuffle(rng, [GAP, ...sound]);
    const [next, opts, correct] = options(rng, [label(GAP)], sound.map(label));
    return [
      next,
      {
        prompt: 'В сетке правил межсетевого экрана найди правило-щель.',
        options: opts,
        multi: false,
        ordered: false,
        correct,
        view: { rules },
      },
    ];
  },
  verify: verifySet,
  noise: mistakeNoise,
  explainMismatch: () => 'Щель в правилах есть, но этот узел за ней не стоит.',
};
