import type { Case, Flipper as FlipperContent, GameState } from '@zero-day/engine';
import type { ReactNode } from 'react';
import { Flipper } from './Flipper';
import { HudBar } from './HudBar';
import { ObjectiveTracker } from './ObjectiveTracker';

import './hud.css';

type GameHudProps = {
  caseData: Case;
  caseRun: GameState;
  flipper: FlipperContent;
  level: number;
};

export function GameHud({ caseData, caseRun, flipper, level }: GameHudProps): ReactNode {
  return (
    <>
      <HudBar caseTitle={caseData.title} tracks={caseData.tracks} values={caseRun.tracks} />
      <ObjectiveTracker completed={caseRun.objectives} objectives={caseData.objectives} />
      <Flipper caseId={caseRun.caseId} level={level} lines={flipper.lines} tracks={caseRun.tracks} />
    </>
  );
}
