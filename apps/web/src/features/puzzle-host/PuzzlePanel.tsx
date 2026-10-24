import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@zero-day/ui';
import type { PuzzleInstance, PuzzleOption } from '@zero-day/engine';
import { ru } from '../../shared/ui/strings';
import { ScanTuner } from './ScanTuner';
import { BruteLock } from './BruteLock';
import { VirusMaze } from './VirusMaze';
import { DdosStorm } from './DdosStorm';
import { InjectionPaint } from './InjectionPaint';
import type { GameProps } from './game';

type PuzzlePanelProps = {
  puzzle: PuzzleInstance;
  onCancel: () => void;
  onSubmit: (answer: string[]) => void;
};

const text = ru.puzzle;

// Archetypes grouped by attack method in NodeContextMenu share one mini-game.
const GAMES: Record<string, (props: GameProps) => ReactNode> = {
  brute: BruteLock,
  crypto: BruteLock,
  rootkit: VirusMaze,
  evasion: VirusMaze,
  scan: DdosStorm,
  wipe: DdosStorm,
  exploit: InjectionPaint,
};

function viewNumber(view: Record<string, unknown>, key: string, fallback: number): number {
  return typeof view[key] === 'number' ? view[key] : fallback;
}

function optionLabel(options: PuzzleOption[], id: string): string {
  return options.find((option) => option.id === id)?.label ?? '';
}

function ToolScene({ puzzle }: { puzzle: PuzzleInstance }): ReactNode {
  const { archetype, view } = puzzle;
  switch (archetype) {
    case 'scan':
      return <div className="puzzle-scene puzzle-scene--radar">{text.radar(viewNumber(view, 'fadeSteps', 1), String(view.defense ?? ''))}</div>;
    case 'exploit':
      return <div className="puzzle-scene puzzle-scene--breach">{text.breach(String(view.breach ?? ''), viewNumber(view, 'contourComplexity', 1))}</div>;
    case 'brute':
      return <div className="puzzle-scene puzzle-scene--tower">{text.tower(viewNumber(view, 'towerHeight', 1))}</div>;
    case 'phish':
      return <div className="puzzle-scene puzzle-scene--mail">{text.mail(viewNumber(view, 'trustSensitivity', 1))}</div>;
    case 'evasion':
      return <div className="puzzle-scene puzzle-scene--beams">{text.beams(viewNumber(view, 'beamCount', 1), viewNumber(view, 'gapWidth', 1))}</div>;
    case 'crypto':
      return <div className="puzzle-scene puzzle-scene--rotors">{text.rotors(viewNumber(view, 'rotorCount', 1), viewNumber(view, 'hintCount', 1))}</div>;
    case 'rootkit':
      return <div className="puzzle-scene puzzle-scene--edr">{text.edr(viewNumber(view, 'parameterCount', 1), viewNumber(view, 'edrThreshold', 1))}</div>;
    case 'wipe':
      return <div className="puzzle-scene puzzle-scene--logs">{text.logs(viewNumber(view, 'errorPenalty', 1))}</div>;
    default:
      return null;
  }
}

function ProfileSliders({ puzzle, answer, onChange }: { puzzle: PuzzleInstance; answer: string[]; onChange: (next: string[]) => void }): ReactNode {
  const count = viewNumber(puzzle.view, 'parameterCount', 3);
  const ids = answer.length === count ? answer : Array.from({ length: count }, () => puzzle.options[0]?.id ?? '');
  return (
    <div className="puzzle-sliders" aria-label={text.profileLabel}>
      {ids.map((id, index) => {
        const value = Math.max(0, puzzle.options.findIndex((option) => option.id === id));
        return (
          <label className="puzzle-slider" key={index}>
            <span>{text.profileParameter(index + 1, optionLabel(puzzle.options, id))}</span>
            <input
              type="range"
              min="0"
              max={Math.max(0, puzzle.options.length - 1)}
              value={value}
              onChange={(event) => {
                const next = [...ids];
                next[index] = puzzle.options[Number(event.target.value)]?.id ?? '';
                onChange(next);
              }}
            />
          </label>
        );
      })}
    </div>
  );
}

export function PuzzlePanel({ puzzle, onCancel, onSubmit }: PuzzlePanelProps): ReactNode {
  const [answer, setAnswer] = useState<string[]>([]);

  useEffect(() => {
    setAnswer([]);
  }, [puzzle]);

  function choose(id: string): void {
    if (puzzle.ordered) {
      setAnswer((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
      return;
    }
    if (puzzle.multi) {
      setAnswer((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
      return;
    }
    setAnswer([id]);
  }

  const selected = answer.map((id) => optionLabel(puzzle.options, id)).filter(Boolean);

  if (puzzle.action === 'scan') {
    return (
      <div className="puzzle-host">
        <p className="puzzle-host__tool">{text.tool(puzzle.archetype)}</p>
        <p className="puzzle-host__prompt">{puzzle.prompt}</p>
        <ScanTuner key={`${puzzle.nodeId}:${puzzle.vuln}`} puzzle={puzzle} onCancel={onCancel} onSubmit={onSubmit} />
      </div>
    );
  }

  // A scan-archetype weakness reached through a hypothesis is the DDoS attack.
  const Game = GAMES[puzzle.archetype];
  if (Game) {
    return (
      <div className="puzzle-host">
        <p className="puzzle-host__tool">{text.tool(puzzle.archetype)}</p>
        <Game key={`${puzzle.nodeId}:${puzzle.vuln}`} puzzle={puzzle} onCancel={onCancel} onSubmit={onSubmit} />
      </div>
    );
  }

  return (
    <div className="puzzle-host">
      <p className="puzzle-host__tool">{text.tool(puzzle.archetype)}</p>
      <p className="puzzle-host__prompt">{puzzle.prompt}</p>
      <ToolScene puzzle={puzzle} />
      {puzzle.archetype === 'rootkit' ? (
        <ProfileSliders puzzle={puzzle} answer={answer} onChange={setAnswer} />
      ) : (
        <div className="puzzle-options" aria-label={text.optionsLabel}>
          {puzzle.options.map((option) => {
            const position = answer.indexOf(option.id);
            const isSelected = position >= 0;
            return (
              <button
                aria-pressed={isSelected}
                className={`puzzle-option${isSelected ? ' puzzle-option--selected' : ''}`}
                key={option.id}
                onClick={() => choose(option.id)}
                type="button"
              >
                {puzzle.ordered && isSelected ? `${String(position + 1)}. ` : ''}
                {option.label}
              </button>
            );
          })}
        </div>
      )}
      {puzzle.ordered && puzzle.archetype !== 'rootkit' && <p className="puzzle-host__selected">{text.sequence(selected.join(' · '))}</p>}
      <p className="puzzle-host__attempts">{text.attempts(puzzle.attemptsLeft)}</p>
      <div className="puzzle-actions">
        <Button onClick={onCancel} type="button" variant="ghost">
          {text.cancel}
        </Button>
        <Button onClick={() => setAnswer([])} type="button" variant="ghost">
          {text.clear}
        </Button>
        <Button disabled={answer.length === 0} onClick={() => onSubmit(answer)} type="button" variant="primary">
          {text.submit(puzzle.archetype)}
        </Button>
      </div>
    </div>
  );
}
