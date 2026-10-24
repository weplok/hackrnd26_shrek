import { apply, createGame, startCase } from '@zero-day/engine';
import type { Command, Content, Difficulty, GameState, StepResult } from '@zero-day/engine';
import { create } from 'zustand';
import { gameSessionEffects } from './effects';

export type StartCaseInput = {
  caseId: string;
  content: Content;
  difficulty: Difficulty;
  seed?: number;
};

export type GameSessionStore = {
  caseRun: GameState | null;
  clear: () => void;
  dispatch: (command: Command) => StepResult | undefined;
  resume: (content: Content, caseRun: GameState) => void;
  start: (input: StartCaseInput) => GameState;
};

export function createGameSessionStore() {
  let content: Content | undefined;

  return create<GameSessionStore>((set, get) => ({
    caseRun: null,
    clear: () => {
      content = undefined;
      set({ caseRun: null });
    },
    dispatch: (command) => {
      const caseRun = get().caseRun;
      if (!content || !caseRun) return undefined;

      const result = apply(content, caseRun, command);
      set({ caseRun: result.state });
      for (const event of result.events) {
        gameSessionEffects.emit('engine-event', { event, state: result.state });
      }
      return result;
    },
    resume: (nextContent, caseRun) => {
      content = nextContent;
      set({ caseRun });
    },
    start: (input) => {
      content = input.content;
      const caseRun = startCase(input.content, createGame(input.content, input.caseId, input.difficulty, input.seed));
      set({ caseRun });
      return caseRun;
    },
  }));
}

export const useCaseStore = createGameSessionStore();
