// @zero-day/engine — public API.
export * from './types.ts';
export { mulberry32, shuffle } from './rng.ts';
export { evalCondition } from './conditions.ts';
export {
  createGame,
  startCase,
  scan,
  hypothesize,
  submitPuzzle,
  cancelPuzzle,
  combine,
  fillSocket,
  openChat,
  closeChat,
  present,
  confirmScope,
  wait,
  answerReport,
  computeRank,
  recompute,
  profileStyle,
} from './engine.ts';
export { generatePuzzle, verifyPuzzle } from './puzzles.ts';
export { apply, validate } from './commands.ts';
export type { Command, GameEvent, RejectReason, StepResult } from './commands.ts';
export { resolveNpcTurn } from './npc.ts';
export { buildContent } from './load.ts';
