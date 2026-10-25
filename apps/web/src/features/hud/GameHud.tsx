import type { Case, Flipper as FlipperContent, GameState } from '@zero-day/engine';
import type { ReactNode } from 'react';
import { Flipper } from './Flipper';
import { HudBar } from './HudBar';
import { ObjectiveTracker } from './ObjectiveTracker';
import { hasFlipperJoined } from './logic';

import './hud.css';

type GameHudProps = {
  caseData: Case;
  caseRun: GameState;
  flipper: FlipperContent;
  level: number;
};

export function GameHud({ caseData, caseRun, flipper, level }: GameHudProps): ReactNode {
  const flipperJoined = hasFlipperJoined(caseRun.flags, level);

  return (
    <>
      <HudBar caseTitle={caseData.title} tracks={caseData.tracks} values={caseRun.tracks} />
      <ObjectiveTracker completed={caseRun.objectives} objectives={caseData.objectives} ticks={caseRun.tick} scans={caseRun.scans} />
      {flipperJoined ? <Flipper caseId={caseRun.caseId} level={level} lines={flipper.lines} tracks={caseRun.tracks} /> : null}
    </>
  );
}
