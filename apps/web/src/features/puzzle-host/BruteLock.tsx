import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@zero-day/ui';
import { ru } from '../../shared/ui/strings';
import { seeded, type GameProps } from './game';

type Hint = 'eq' | 'up' | 'down' | null;

const text = ru.puzzle;
const DIGITS = 4;

const wrap = (value: number): number => (value + 10) % 10;

export function BruteLock({ puzzle, onCancel, onSubmit }: GameProps): ReactNode {
  const [code] = useState(() => {
    const rand = seeded(puzzle);
    return Array.from({ length: DIGITS }, () => Math.floor(rand() * 10));
  });
  const [dials, setDials] = useState<number[]>(() => Array.from({ length: DIGITS }, () => 0));
  const [hints, setHints] = useState<Hint[]>(() => Array.from({ length: DIGITS }, () => null));
  const [tries, setTries] = useState(0);
  const opened = hints.every((hint) => hint === 'eq');

  useEffect(() => {
    if (!opened) return;
    const timer = setTimeout(() => onSubmit(puzzle.correct), 800);
    return () => clearTimeout(timer);
  }, [opened, onSubmit, puzzle.correct]);

  function turn(index: number, delta: number): void {
    if (opened) return;
    setDials((current) => current.map((value, i) => (i === index ? wrap(value + delta) : value)));
    setHints((current) => current.map((hint, i) => (i === index ? null : hint)));
  }

  function check(): void {
    setTries((n) => n + 1);
    setHints(dials.map((value, i) => ((code[i] ?? 0) === value ? 'eq' : (code[i] ?? 0) > value ? 'up' : 'down')));
  }

  return (
    <div className="brute-lock">
      <p className="puzzle-host__prompt">{text.bruteRules}</p>
      <div className={`brute-lock__dials${opened ? ' brute-lock__dials--open' : ''}`}>
        {dials.map((value, index) => {
          const hint = hints[index] ?? null;
          return (
            <div className="brute-lock__dial" key={index}>
              <button aria-label={text.bruteUp(index + 1)} className="brute-lock__turn" onClick={() => turn(index, 1)} type="button">
                ▲
              </button>
              <div
                className={`brute-lock__drum${hint === 'eq' ? ' brute-lock__drum--eq' : ''}`}
                onWheel={(event) => turn(index, event.deltaY < 0 ? 1 : -1)}
              >
                <span className="brute-lock__ghost">{wrap(value + 1)}</span>
                <span className="brute-lock__digit">{value}</span>
                <span className="brute-lock__ghost">{wrap(value - 1)}</span>
              </div>
              <button aria-label={text.bruteDown(index + 1)} className="brute-lock__turn" onClick={() => turn(index, -1)} type="button">
                ▼
              </button>
              <span className={`brute-lock__hint${hint ? ` brute-lock__hint--${hint}` : ''}`}>{hint ? text.bruteHint[hint] : ' '}</span>
            </div>
          );
        })}
      </div>
      <p className="puzzle-host__attempts">{opened ? text.bruteOpen : text.bruteTries(tries)}</p>
      <div className="puzzle-actions">
        <Button onClick={onCancel} type="button" variant="ghost">
          {text.cancel}
        </Button>
        <Button disabled={opened} onClick={check} type="button" variant="primary">
          {text.bruteCheck}
        </Button>
      </div>
    </div>
  );
}
