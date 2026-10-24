import type { Case, GameState } from '@zero-day/engine';
import type { ReactNode } from 'react';
import { ru } from '../../shared/ui/strings';

import './hud.css';

type ObjectiveTrackerProps = {
  objectives: Case['objectives'];
  completed: GameState['objectives'];
};

export function ObjectiveTracker({ completed, objectives }: ObjectiveTrackerProps): ReactNode {
  return (
    <section aria-labelledby="objective-tracker-title" className="objective-tracker">
      <h2 id="objective-tracker-title">{ru.hud.objectives}</h2>
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
