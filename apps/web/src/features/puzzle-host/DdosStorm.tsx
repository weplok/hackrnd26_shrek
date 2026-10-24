import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@zero-day/ui';
import { ru } from '../../shared/ui/strings';
import type { GameProps } from './game';

type Status = 'ready' | 'run' | 'won' | 'lost';

const text = ru.puzzle;
const CENTER = 50;
const SERVERS = [
  [CENTER, 12],
  [88, CENTER],
  [CENTER, 88],
  [12, CENTER],
] as const;
const CORE_R = 8;
const MIN_R = 4;
// Full power makes a ball touch the core.
const MAX_R = CENTER - 12 - CORE_R;
const GAIN = 0.07;
const DECAY = 0.08; // per second
const REACH = 1;
const LIMIT_S = 60;

const zero = (): number[] => SERVERS.map(() => 0);

export function DdosStorm({ puzzle, onCancel, onSubmit }: GameProps): ReactNode {
  const power = useRef<number[]>(zero());
  const submit = useRef(onSubmit);
  const [status, setStatus] = useState<Status>('ready');
  const [view, setView] = useState({ power: zero(), left: LIMIT_S });

  useEffect(() => {
    submit.current = onSubmit;
  });

  useEffect(() => {
    if (status !== 'run') return;
    const began = performance.now();
    let last = began;
    let raf = 0;
    const frame = (now: number): void => {
      const dt = (now - last) / 1000;
      last = now;
      power.current = power.current.map((p) => Math.max(0, p - DECAY * dt));
      const left = Math.max(0, LIMIT_S - (now - began) / 1000);
      setView({ power: power.current, left });
      if (power.current.every((p) => p >= REACH)) {
        setStatus('won');
        setTimeout(() => submit.current(puzzle.correct), 900);
        return;
      }
      if (left <= 0) {
        setStatus('lost');
        submit.current([]);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [status, puzzle.correct]);

  function start(): void {
    power.current = zero();
    setView({ power: zero(), left: LIMIT_S });
    setStatus('run');
  }

  function pump(index: number): void {
    if (status !== 'run') return;
    power.current = power.current.map((p, i) => (i === index ? Math.min(1, p + GAIN) : p));
  }

  const reached = view.power.filter((p) => p >= REACH).length;

  return (
    <div className="ddos-storm">
      <p className="puzzle-host__prompt">{text.ddosRules}</p>
      <div className={`ddos-storm__stage ddos-storm__stage--${status}`}>
        <svg className="ddos-storm__field" viewBox="0 0 100 100">
          <circle className={`ddos-storm__core ddos-storm__core--${String(reached)}`} cx={CENTER} cy={CENTER} r={CORE_R} />
          {SERVERS.map(([x, y], i) => {
            const p = view.power[i] ?? 0;
            return (
              <circle
                aria-label={text.ddosServer(i + 1)}
                className={`ddos-storm__ball${p >= REACH ? ' ddos-storm__ball--hit' : ''}`}
                cx={x}
                cy={y}
                key={i}
                onPointerDown={() => pump(i)}
                r={MIN_R + p * (MAX_R - MIN_R)}
                role="button"
              />
            );
          })}
        </svg>
        {status === 'won' && (
          <div className="ddos-storm__down">
            <span className="ddos-storm__down-icon" aria-hidden="true" />
            <span>{text.ddosWon}</span>
          </div>
        )}
      </div>
      <p className="puzzle-host__attempts">
        {status === 'won' ? text.ddosWon : status === 'lost' ? text.ddosLost : text.ddosStatus(reached, Math.ceil(view.left))}
      </p>
      <p className="puzzle-host__attempts">{text.attempts(puzzle.attemptsLeft)}</p>
      <div className="puzzle-actions">
        <Button onClick={onCancel} type="button" variant="ghost">
          {text.cancel}
        </Button>
        <Button disabled={status === 'run' || status === 'won'} onClick={start} type="button" variant="primary">
          {status === 'lost' ? text.retry : text.start}
        </Button>
      </div>
    </div>
  );
}
