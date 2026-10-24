import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@zero-day/ui';
import { ru } from '../../shared/ui/strings';
import { seeded, type GameProps } from './game';
import type { PuzzleInstance } from '@zero-day/engine';

type Phase = 'show' | 'draw' | 'check' | 'fail' | 'pass';
type Ink = 0 | 1;

const text = ru.puzzle;
const SIZE = 5;
const SHOW_MS = 2600;
const blank = (): Ink[] => Array.from({ length: SIZE * SIZE }, (): Ink => 0);

// Mirrored left half keeps the picture memorable after it slides away.
function picture(puzzle: PuzzleInstance): Ink[] {
  const rand = seeded(puzzle);
  for (;;) {
    const cells = blank();
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x <= SIZE >> 1; x++) {
        const r = rand();
        const ink: Ink = r < 0.42 ? 1 : 0;
        cells[y * SIZE + x] = ink;
        cells[y * SIZE + (SIZE - 1 - x)] = ink;
      }
    }
    if (cells.filter(Boolean).length >= 6) return cells;
  }
}

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
  const [target] = useState(() => picture(puzzle));
  const [sheet, setSheet] = useState<Ink[]>(blank);
  const [phase, setPhase] = useState<Phase>('show');

  useEffect(() => {
    const delay = { show: SHOW_MS, draw: 0, check: 900, fail: 1600, pass: 1200 }[phase];
    if (!delay) return;
    const timer = setTimeout(() => {
      if (phase === 'show') setPhase('draw');
      else if (phase === 'check') setPhase(sheet.every((ink, i) => ink === target[i]) ? 'pass' : 'fail');
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
