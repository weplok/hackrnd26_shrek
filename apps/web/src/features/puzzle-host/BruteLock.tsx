import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@zero-day/ui';
import { ru } from '../../shared/ui/strings';
import { seeded, type GameProps } from './game';

type Hint = 'eq' | 'up' | 'down' | null;

const text = ru.puzzle;
const DIGITS = 4;

const wrap = (value: number): number => (value + 10) % 10;
const KEYS: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

export function BruteLock({ puzzle, onCancel, onSubmit }: GameProps): ReactNode {
  const [code] = useState(() => {
    const rand = seeded(puzzle);
    return Array.from({ length: DIGITS }, () => Math.floor(rand() * 10));
  });
  const [dials, setDials] = useState<number[]>(() => Array.from({ length: DIGITS }, () => 0));
  const [hints, setHints] = useState<Hint[]>(() => Array.from({ length: DIGITS }, () => null));
  const [tries, setTries] = useState(0);
  const [active, setActive] = useState(0);
  const [pressed, setPressed] = useState<string | null>(null);
  const opened = hints.every((hint) => hint === 'eq');

  useEffect(() => {
    if (!opened) return;
    const timer = setTimeout(() => onSubmit(puzzle.correct), 800);
    return () => clearTimeout(timer);
  }, [opened, onSubmit, puzzle.correct]);

  useEffect(() => {
    if (!pressed) return;
    const timer = setTimeout(() => setPressed(null), 150);
    return () => clearTimeout(timer);
  }, [pressed]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code === 'Enter' || event.code === 'NumpadEnter') {
        event.preventDefault();
        if (!opened) check();
        return;
      }
      const key = KEYS[event.code];
      if (!key) return;
      event.preventDefault();
      if (key === 'left' || key === 'right') {
        setActive((index) => (index + (key === 'right' ? 1 : DIGITS - 1)) % DIGITS);
        return;
      }
      turn(active, key === 'up' ? 1 : -1);
      setPressed(`${String(active)}:${key}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
            <div className={`brute-lock__dial${index === active ? ' brute-lock__dial--active' : ''}`} key={index} onPointerDown={() => setActive(index)}>
              <button
                aria-label={text.bruteUp(index + 1)}
                className={`brute-lock__turn${pressed === `${String(index)}:up` ? ' brute-lock__turn--pressed' : ''}`}
                onClick={() => turn(index, 1)}
                type="button"
              >
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
              <button
                aria-label={text.bruteDown(index + 1)}
                className={`brute-lock__turn${pressed === `${String(index)}:down` ? ' brute-lock__turn--pressed' : ''}`}
                onClick={() => turn(index, -1)}
                type="button"
              >
                ▼
              </button>
              <span className={`brute-lock__hint${hint ? ` brute-lock__hint--${hint}` : ''}`}>{hint ? text.bruteHint[hint] : ' '}</span>
            </div>
          );
        })}
      </div>
      <p className="brute-lock__keys">{text.bruteKeys}</p>
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
