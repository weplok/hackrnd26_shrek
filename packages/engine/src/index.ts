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
  restoreCheckpoint,
  alarmLevel,
  noiseSources,
  computeRank,
  recompute,
  profileStyle,
} from './engine.ts';
export type { AlarmLevel } from './engine.ts';
export { generatePuzzle, verifyPuzzle, checkPuzzle, puzzleLogic, PUZZLES } from './puzzles/index.ts';
export type { PuzzleLogic, PuzzleBody, PuzzleOption, VerifyResult, GenerateCtx } from './puzzles/index.ts';
export { apply, validate } from './commands.ts';
export type { Command, GameEvent, RejectReason, StepResult } from './commands.ts';
export { resolveNpcTurn } from './npc.ts';
export { buildContent } from './load.ts';
