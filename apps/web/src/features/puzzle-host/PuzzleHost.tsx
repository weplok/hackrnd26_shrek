import type { ReactNode } from 'react';
import { Modal } from '@zero-day/ui';
import { useCaseStore } from '../game-session';
import { ru } from '../../shared/ui/strings';
import { PuzzlePanel } from './PuzzlePanel';

export function PuzzleHost(): ReactNode {
  const puzzle = useCaseStore((state) => state.caseRun?.activePuzzle ?? null);
  const dispatch = useCaseStore((state) => state.dispatch);

  if (!puzzle) return null;

  return (
    <Modal closeLabel={ru.puzzle.close} isOpen onClose={() => dispatch({ type: 'CancelPuzzle' })} title={ru.puzzle.running(puzzle.title)}>
      <PuzzlePanel
        puzzle={puzzle}
        onCancel={() => dispatch({ type: 'CancelPuzzle' })}
        onSubmit={(answer) => dispatch({ type: 'SubmitPuzzle', answer })}
      />
    </Modal>
  );
}
