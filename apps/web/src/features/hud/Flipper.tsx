import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Flipper as FlipperContent, GameState } from '@zero-day/engine';
import { subscribeToGameEvents } from '../game-session';
import { ru } from '../../shared/ui/strings';
import { findFlipperLine, getFlipperMood, getFlipperText } from './logic';
import { useAchievements, type Achievement } from './achievements';

import './hud.css';

// Events that mean the player is struggling vs. making progress. After a few failures
// in a row with no progress between them, Flipper volunteers an explicit next-step hint.
const FAIL_EVENTS = new Set(['CommandRejected', 'PuzzleFailed', 'ExploitMismatched', 'CombineFailed']);
const PROGRESS_EVENTS = new Set([
  'NodeScanned',
  'CluesFound',
  'ExploitSucceeded',
  'PuzzleSolved',
  'KeyAssembled',
  'SocketFilled',
  'LockOpened',
  'ObjectiveCompleted',
  'NodeSecured',
  'CaseCompleted',
]);
const STUCK_AFTER_FAILS = 3;

type FlipperProps = {
  caseId: string;
  level: number;
  lines: FlipperContent['lines'];
  tracks: GameState['tracks'];
};

export function Flipper({ caseId, level, lines, tracks }: FlipperProps): ReactNode {
  const [line, setLine] = useState<{ caseId: string; text: string } | null>(null);
  const lastSpoken = useRef<{ caseId: string; tick: number } | undefined>(undefined);
  const failStreak = useRef(0);
  const mood = getFlipperMood(tracks);
  const latestAchievement = useAchievements((state) => state.latest);
  const [badge, setBadge] = useState<Achievement | null>(null);

  useEffect(() => {
    if (!latestAchievement) return;
    setBadge(latestAchievement);
    const id = window.setTimeout(() => {
      setBadge(null);
    }, 6000);
    return () => {
      window.clearTimeout(id);
    };
  }, [latestAchievement]);

  useEffect(() => {
    failStreak.current = 0;
    return subscribeToGameEvents(({ event, state }) => {
      if (state.caseId !== caseId) return;

      if (PROGRESS_EVENTS.has(event.type)) failStreak.current = 0;
      if (FAIL_EVENTS.has(event.type)) {
        failStreak.current += 1;
        // Enough stumbles in a row: hand the player a concrete next step, cooldown aside.
        if (failStreak.current >= STUCK_AFTER_FAILS) {
          failStreak.current = 0;
          lastSpoken.current = { caseId, tick: state.tick };
          setLine({ caseId, text: ru.hud.flipperStuck });
          return;
        }
      }

      const lastSpokenTick = lastSpoken.current?.caseId === caseId ? lastSpoken.current.tick : undefined;
      const nextLine = findFlipperLine(lines, event, state, level, lastSpokenTick);
      if (!nextLine) return;

      lastSpoken.current = { caseId, tick: state.tick };
      setLine({ caseId, text: getFlipperText(nextLine, state.tick) });
    });
  }, [caseId, level, lines]);

  return (
    <aside aria-label={ru.hud.flipper} className={`flipper flipper--${mood}`}>
      <div
        className={`flipper__sprite flipper__sprite--${mood}`}
        role="img"
        aria-label={ru.hud.spriteAlt[mood]}
      />
      <div className="flipper__content">
        <div className="flipper__meta">
          <strong>{ru.hud.flipper}</strong>
          <span>{ru.hud.moods[mood]}</span>
        </div>
        <p aria-live="polite" className="flipper__line" role="status">
          {line?.caseId === caseId ? line.text : ru.hud.flipperReady}
        </p>
      </div>
      {badge && (
        <div className="flipper__achievement" role="status" aria-live="polite">
          <span className="flipper__achievement-tag">{ru.hud.achievement}</span>
          <strong className="flipper__achievement-title">{badge.title}</strong>
          <span className="flipper__achievement-desc">{badge.desc}</span>
        </div>
      )}
    </aside>
  );
}
