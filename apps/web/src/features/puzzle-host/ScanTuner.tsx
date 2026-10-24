import { useState, type ReactNode } from 'react';
import { Button } from '@zero-day/ui';
import type { PuzzleInstance } from '@zero-day/engine';
import { ru } from '../../shared/ui/strings';

type Peak = { id: string; label: string; x: number; height: number };

type ScanTunerProps = {
  puzzle: PuzzleInstance;
  onCancel: () => void;
  onSubmit: (answer: string[]) => void;
};

const text = ru.puzzle;
const SNAP = 5;
const W = 100;
const H = 60;
const BASE = H - 6;

function readPeaks(view: Record<string, unknown>): Peak[] {
  return Array.isArray(view.peaks) ? (view.peaks as Peak[]) : [];
}

function signal(x: number, peaks: Peak[]): number {
  const noise = 1.2 * Math.sin(x * 1.7) + 0.8 * Math.sin(x * 4.3);
  const sum = peaks.reduce((acc, p) => acc + (p.height / 100) * (BASE - 8) * Math.exp(-((x - p.x) ** 2) / 8), 0);
  return BASE - Math.max(0, sum + noise + 2);
}

function curve(peaks: Peak[]): string {
  const points: string[] = [];
  for (let x = 0; x <= W; x += 0.5) points.push(`${x.toFixed(1)},${signal(x, peaks).toFixed(2)}`);
  return `M0,${String(BASE)} L${points.join(' L')} L${String(W)},${String(BASE)} Z`;
}

export function ScanTuner({ puzzle, onCancel, onSubmit }: ScanTunerProps): ReactNode {
  const peaks = readPeaks(puzzle.view);
  const [pos, setPos] = useState(0);
  const [missed, setMissed] = useState<string[]>([]);
  const locked = peaks.find((p) => Math.abs(p.x - pos) <= SNAP) ?? null;

  function submit(): void {
    if (!locked) return;
    if (!puzzle.correct.includes(locked.id)) setMissed((m) => (m.includes(locked.id) ? m : [...m, locked.id]));
    onSubmit([locked.id]);
  }

  return (
    <div className="scan-tuner">
      <svg className="scan-tuner__graph" viewBox={`0 0 ${String(W)} ${String(H)}`} preserveAspectRatio="none" role="img" aria-label={text.scanGraph}>
        <path className="scan-tuner__area" d={curve(peaks)} />
        <line className="scan-tuner__cursor" x1={pos} x2={pos} y1="0" y2={BASE} />
      </svg>
      <div className="scan-tuner__labels">
        {peaks.map((p) => (
          <span
            className={`scan-tuner__label${locked?.id === p.id ? ' scan-tuner__label--locked' : ''}${missed.includes(p.id) ? ' scan-tuner__label--missed' : ''}`}
            key={p.id}
            style={{ left: `${String(p.x)}%` }}
          >
            {p.label}
          </span>
        ))}
      </div>
      <input
        aria-label={text.scanSlider}
        className="scan-tuner__slider"
        max={W}
        min="0"
        onChange={(event) => setPos(Number(event.target.value))}
        step="0.5"
        type="range"
        value={pos}
      />
      <p className="puzzle-host__attempts">{locked ? text.scanLocked(locked.label) : text.scanSeek}</p>
      <p className="puzzle-host__attempts">{text.scanRules}</p>
      <div className="puzzle-actions">
        <Button onClick={onCancel} type="button" variant="ghost">
          {text.scanLeave}
        </Button>
        <Button disabled={!locked} onClick={submit} type="button" variant="primary">
          {text.submit(puzzle.archetype)}
        </Button>
      </div>
    </div>
  );
}
