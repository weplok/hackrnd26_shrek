import type { GameEvent, GameState } from '@zero-day/engine';
import { subscribeToGameEvents } from '../game-session';
import type { SaveData, SaveRepository } from './SaveRepository';

// Node taken, case step done, case closed or rolled back (FR-110).
const SIGNIFICANT = new Set<GameEvent['type']>([
  'NodeCompromised',
  'ObjectiveCompleted',
  'CaseWon',
  'TargetReached',
  'Caught',
  'CheckpointRestored',
]);

export function withCaseRun(save: SaveData, state: GameState): SaveData {
  const opened = Object.keys(state.codex).filter((id) => state.codex[id]);
  const won = state.phase === 'won' && !save.completedCases.includes(state.caseId);
  return {
    ...save,
    caseRun: state,
    codex: [...new Set([...save.codex, ...opened])],
    completedCases: won ? [...save.completedCases, state.caseId] : save.completedCases,
    profile: won
      ? {
          technicalSuccesses: save.profile.technicalSuccesses + state.technicalSuccesses,
          socialSuccesses: save.profile.socialSuccesses + state.socialSuccesses,
        }
      : save.profile,
  };
}

export function startAutosave(repository: SaveRepository, getState: () => GameState | null): () => void {
  function persist(state: GameState | null): void {
    if (state) repository.update((save) => withCaseRun(save, state));
  }

  const unsubscribe = subscribeToGameEvents(({ event, state }) => {
    if (SIGNIFICANT.has(event.type)) persist(state);
  });
  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') persist(getState());
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
