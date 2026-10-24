import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@zero-day/ui';
import { ru } from '../../shared/ui/strings';
import type { GameProps } from './game';

type Phase = 'ready' | 'show' | 'draw' | 'check' | 'fail' | 'pass';
type Ink = 0 | 1;

const text = ru.puzzle;
const SIZE = 5;
const SHOW_S = 3;
const blank = (): Ink[] => Array.from({ length: SIZE * SIZE }, (): Ink => 0);

const FIGURES = [
  ['.#.#.', '#####', '#####', '.###.', '..#..'],
  ['..#..', '.###.', '#.#.#', '..#..', '..#..'],
  ['..#..', '.###.', '#####', '.#.#.', '.#.#.'],
  ['.#.#.', '.#.#.', '.....', '#...#', '.###.'],
  ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
].map((rows) => rows.join('').split('').map((c): Ink => (c === '#' ? 1 : 0)));

function Grid({ cells, onPaint }: { cells: Ink[]; onPaint?: ((index: number) => void) | undefined }): ReactNode {
  return (
    <div className="inject-paint__grid">
      {cells.map((ink, i) =>
        onPaint ? (
          <button
            aria-label={text.injectCell(Math.floor(i / SIZE) + 1, (i % SIZE) + 1)}
            className={`inject-paint__cell inject-paint__cell--${String(ink)}`}
            key={i}
            onClick={() => onPaint(i)}
            type="button"
          />
        ) : (
          <span className={`inject-paint__cell inject-paint__cell--${String(ink)}`} key={i} />
        ),
      )}
    </div>
  );
}

export function InjectionPaint({ puzzle, onCancel, onSubmit }: GameProps): ReactNode {
  const [target] = useState(() => FIGURES[Math.floor(Math.random() * FIGURES.length)] ?? blank());
  const [sheet, setSheet] = useState<Ink[]>(blank);
  const [phase, setPhase] = useState<Phase>('ready');
  const [count, setCount] = useState(SHOW_S);

  useEffect(() => {
    if (phase !== 'show') return;
    if (count === 0) {
      setPhase('draw');
      return;
    }
    const timer = setTimeout(() => setCount((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, count]);

  useEffect(() => {
    const delay = { ready: 0, show: 0, draw: 0, check: 900, fail: 1600, pass: 1200 }[phase];
    if (!delay) return;
    const timer = setTimeout(() => {
      if (phase === 'check') setPhase(sheet.every((ink, i) => ink !== target[i]) ? 'pass' : 'fail');
      else if (phase === 'fail') {
        setSheet(blank());
        setPhase('draw');
      } else if (phase === 'pass') onSubmit(puzzle.correct);
    }, delay);
    return () => clearTimeout(timer);
  }, [phase, sheet, target, onSubmit, puzzle.correct]);

  function paint(index: number): void {
    setSheet((cells) => cells.map((ink, i) => (i === index ? (ink ? 0 : 1) : ink)));
  }

  return (
    <div className="inject-paint">
      <p className="puzzle-host__prompt">{text.injectRules}</p>
      <div className={`inject-paint__stage inject-paint__stage--${phase}`}>
        <div className="inject-paint__card inject-paint__card--target">
          <Grid cells={target} />
        </div>
        <div className="inject-paint__card inject-paint__card--sheet">
          <Grid cells={sheet} onPaint={phase === 'draw' ? paint : undefined} />
        </div>
        {phase === 'ready' && (
          <div className="inject-paint__overlay">
            <Button
              onClick={() => {
                setCount(SHOW_S);
                setPhase('show');
              }}
              type="button"
              variant="primary"
            >
              {text.start}
            </Button>
          </div>
        )}
        {phase === 'show' && <span className="inject-paint__count">{count}</span>}
      </div>
      <p className="puzzle-host__attempts">{text.injectPhase[phase]}</p>
      <div className="puzzle-actions">
        <Button onClick={onCancel} type="button" variant="ghost">
          {text.cancel}
        </Button>
        <Button disabled={phase !== 'draw'} onClick={() => setSheet(blank())} type="button" variant="ghost">
          {text.clear}
        </Button>
        <Button disabled={phase !== 'draw' || !sheet.some(Boolean)} onClick={() => setPhase('check')} type="button" variant="primary">
          {text.injectCheck}
        </Button>
      </div>
    </div>
  );
}
