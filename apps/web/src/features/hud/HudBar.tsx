import type { Case, GameState } from '@zero-day/engine';
import { Meter } from '@zero-day/ui';
import type { ReactNode } from 'react';
import { getTrackStatus } from './logic';

import './hud.css';

type HudBarProps = {
  caseTitle: string;
  tracks: Case['tracks'];
  values: GameState['tracks'];
};

export function HudBar({ caseTitle, tracks, values }: HudBarProps): ReactNode {
  return (
    <header aria-label={caseTitle} className="hud-bar">
      <strong className="hud-bar__case">{caseTitle}</strong>
      <div className="hud-bar__tracks">
        {tracks.map((track) => {
          const value = values[track.id] ?? track.start;
          return (
            <Meter
              key={track.id}
              label={track.label}
              status={getTrackStatus(track.id, value)}
              value={value}
              valueText={`${String(value)}%`}
            />
          );
        })}
      </div>
    </header>
  );
}
