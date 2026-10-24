import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '@zero-day/engine';
import { gameSessionEffects } from '../game-session';
import { startAutosave, withCaseRun } from './autosave';
import { SAVE_KEY, SAVE_VERSION, SaveRepository, emptySave, memoryStore } from './SaveRepository';

const caseRun = { caseId: 'L1C1', phase: 'playing', codex: { 'SL-01': true } } as unknown as GameState;

function seeded(value: unknown) {
  const store = memoryStore();
  store.setItem(SAVE_KEY, typeof value === 'string' ? value : JSON.stringify(value));
  return store;
}

describe('SaveRepository', () => {
  it('round-trips a save', () => {
    const repository = new SaveRepository('1.0.0', memoryStore());
    expect(repository.load().status).toBe('empty');

    repository.write({ ...emptySave('1.0.0'), caseRun, codex: ['SL-01'] });

    expect(repository.load()).toEqual({
      status: 'ok',
      save: { ...emptySave('1.0.0'), caseRun, codex: ['SL-01'] },
    });
  });

  it('drops the case but keeps campaign progress when content changed', () => {
    const store = seeded({ ...emptySave('0.9.0'), caseRun, completedCases: ['L1C1'], codex: ['SL-02'] });

    expect(new SaveRepository('1.0.0', store).load()).toEqual({
      status: 'case-reset',
      save: { ...emptySave('1.0.0'), completedCases: ['L1C1'], codex: ['SL-02'] },
    });
  });

  it('does not crash on broken or future saves', () => {
    expect(new SaveRepository('1.0.0', seeded('{not json')).load().status).toBe('corrupt');
    expect(new SaveRepository('1.0.0', seeded({ saveVersion: SAVE_VERSION + 1 })).load().status).toBe('corrupt');
    expect(new SaveRepository('1.0.0', seeded({ saveVersion: 0 }), {}).load().status).toBe('corrupt');
    expect(new SaveRepository('1.0.0', seeded({ ...emptySave('1.0.0'), caseRun: 42 })).load().status).toBe(
      'case-reset',
    );
  });

  it('runs the migration chain up to the current version', () => {
    const store = seeded({ saveVersion: SAVE_VERSION - 1, contentVersion: '1.0.0', cards: ['SL-03'] });
    const repository = new SaveRepository('1.0.0', store, {
      [SAVE_VERSION - 1]: ({ cards, ...rest }) => ({ ...rest, codex: cards }),
    });

    expect(repository.load()).toEqual({ status: 'ok', save: { ...emptySave('1.0.0'), codex: ['SL-03'] } });
  });

  it('works in memory without localStorage', () => {
    const repository = new SaveRepository('1.0.0', null);

    expect(repository.persistent).toBe(false);
    expect(repository.write({ ...emptySave('1.0.0'), caseRun })).toBe(true);
    expect(repository.load().save.caseRun).toEqual(caseRun);
  });
});

describe('autosave', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('merges codex and marks a won case as completed', () => {
    const won = { ...caseRun, phase: 'won' } as GameState;
    const save = withCaseRun({ ...emptySave('1.0.0'), codex: ['SL-02'] }, won);

    expect(save.codex).toEqual(['SL-02', 'SL-01']);
    expect(save.completedCases).toEqual(['L1C1']);
    expect(withCaseRun(save, won).completedCases).toEqual(['L1C1']);
  });

  it('saves only on significant events', () => {
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
    const repository = new SaveRepository('1.0.0', memoryStore());
    const stop = startAutosave(repository, () => caseRun);

    gameSessionEffects.emit('engine-event', { event: { type: 'Ticked' } as never, state: caseRun });
    expect(repository.load().status).toBe('empty');

    gameSessionEffects.emit('engine-event', { event: { type: 'NodeCompromised' } as never, state: caseRun });
    stop();
    expect(repository.load().save.caseRun).toEqual(caseRun);
  });

  it('saves when the page is hidden', () => {
    const page = Object.assign(new EventTarget(), { visibilityState: 'hidden' });
    vi.stubGlobal('document', page);
    const repository = new SaveRepository('1.0.0', memoryStore());
    const stop = startAutosave(repository, () => caseRun);

    page.dispatchEvent(new Event('visibilitychange'));
    stop();
    expect(repository.load().save.caseRun).toEqual(caseRun);
  });
});
