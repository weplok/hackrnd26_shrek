import { describe, expect, it } from 'vitest';
import type { Content, Difficulty } from '@zero-day/engine';
import { subscribeToGameEvents } from './effects';
import { createGameSessionStore } from './store';

const difficulty = {
  noiseMultiplier: 1,
  alarmDecayPerTick: 0,
  wrongGuessNoise: 1,
  hints: { depth: 'direction', frequency: 'low' },
  flipperPreWarn: false,
  puzzleKnobs: {},
} as Difficulty;

const content = {
  cases: {
    L1C1: {
      nodes: [{ id: 'wifi', inScope: true, scanNoise: 1, exploits: [], onCompromise: [] }],
      segments: [],
      tracks: [{ id: 'alarm', start: 0 }],
      npcs: [],
      clues: [],
      keyRecipes: [],
      objectives: [],
      ranks: [],
      report: { findings: [] },
    },
  },
  npcs: {},
  puzzles: {},
  vulnerabilities: {},
} as unknown as Content;

describe('game session store', () => {
  it('passes commands through engine and publishes resulting events', () => {
    const store = createGameSessionStore();
    const events: string[] = [];
    const unsubscribe = subscribeToGameEvents(({ event }) => {
      events.push(event.type);
    });

    store.getState().start({ content, caseId: 'L1C1', difficulty, seed: 777 });
    const result = store.getState().dispatch({ type: 'ScanNode', node: 'wifi' });

    unsubscribe();

    expect(result?.events[0]).toEqual({ type: 'NodeScanned', node: 'wifi', repeat: false });
    expect(store.getState().caseRun?.nodes.wifi?.scanned).toBe(true);
    expect(events).toContain('NodeScanned');
    expect(events).toContain('Ticked');
  });

  it('does not run commands without an active case', () => {
    const store = createGameSessionStore();

    expect(store.getState().dispatch({ type: 'ScanNode', node: 'wifi' })).toBeUndefined();
  });
});
