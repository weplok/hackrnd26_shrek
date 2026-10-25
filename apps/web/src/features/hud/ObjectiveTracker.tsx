import type { Case, GameState } from '@zero-day/engine';
import type { ReactNode } from 'react';
import { ru } from '../../shared/ui/strings';

import './hud.css';

type ObjectiveTrackerProps = {
  objectives: Case['objectives'];
  completed: GameState['objectives'];
  ticks: number;
  scans: number;
};

export function ObjectiveTracker({ completed, objectives, ticks, scans }: ObjectiveTrackerProps): ReactNode {
  const goalsDone = objectives.filter((objective) => completed[objective.id]).length;

  return (
    <section aria-labelledby="objective-tracker-title" className="objective-tracker">
      <header className="objective-tracker__header">
        <h2 id="objective-tracker-title">{ru.hud.objectives}</h2>
        <span className="objective-tracker__metrics">
          <span>{ru.mission.goals} {String(goalsDone)}/{String(objectives.length)}</span>
          <span>{ru.mission.ticks} {String(ticks)}</span>
          <span>{ru.mission.scans} {String(scans)}</span>
        </span>
      </header>
      <ol>
        {objectives.map((objective) => {
          const done = completed[objective.id] ?? false;
          return (
            <li className={done ? 'objective-tracker__item objective-tracker__item--done' : 'objective-tracker__item'} key={objective.id}>
              <span aria-hidden="true" className="objective-tracker__icon">
                {done ? '✓' : '○'}
              </span>
              <span>{objective.title}</span>
              {done ? <span className="objective-tracker__state">{ru.hud.objectiveDone}</span> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
