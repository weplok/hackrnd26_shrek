import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Flipper as FlipperContent, GameState } from '@zero-day/engine';
import { subscribeToGameEvents } from '../game-session';
import { ru } from '../../shared/ui/strings';
import { findFlipperLine, getFlipperMood, getFlipperText } from './logic';

import './hud.css';

const SPRITE_SOURCE = '/assets/flipper/flipper-states-sketch.png';

type FlipperProps = {
  caseId: string;
  level: number;
  lines: FlipperContent['lines'];
  tracks: GameState['tracks'];
};

export function Flipper({ caseId, level, lines, tracks }: FlipperProps): ReactNode {
  const [line, setLine] = useState<{ caseId: string; text: string } | null>(null);
  const lastSpoken = useRef<{ caseId: string; tick: number } | undefined>(undefined);
  const mood = getFlipperMood(tracks);

  useEffect(() => {
    return subscribeToGameEvents(({ event, state }) => {
      if (state.caseId !== caseId) return;

      const lastSpokenTick = lastSpoken.current?.caseId === caseId ? lastSpoken.current.tick : undefined;
      const nextLine = findFlipperLine(lines, event, state, level, lastSpokenTick);
      if (!nextLine) return;

      lastSpoken.current = { caseId, tick: state.tick };
      setLine({ caseId, text: getFlipperText(nextLine, state.tick) });
    });
  }, [caseId, level, lines]);

  return (
    <aside aria-label={ru.hud.flipper} className={`flipper flipper--${mood}`}>
      <div className="flipper__sprite">
        <img
          alt={ru.hud.spriteAlt[mood]}
          className={`flipper__sprite-image flipper__sprite-image--${mood}`}
          src={SPRITE_SOURCE}
        />
      </div>
      <div className="flipper__content">
        <div className="flipper__meta">
          <strong>{ru.hud.flipper}</strong>
          <span>{ru.hud.moods[mood]}</span>
        </div>
        <p aria-live="polite" className="flipper__line" role="status">
          {line?.caseId === caseId ? line.text : ru.hud.flipperReady}
        </p>
      </div>
    </aside>
  );
}
