import { describe, expect, it } from 'vitest';
import type { Flipper, GameEvent, GameState } from '@zero-day/engine';
import { findFlipperLine, getFlipperMood, getTrackStatus } from './logic';

const state = {
  caseId: 'L1C1',
  tick: 7,
  tracks: { alarm: 78 },
} as unknown as GameState;

const alarmLine = {
  id: 'alarm_high',
  trigger: {
    event: 'TrackChanged',
    when: { trackAbove: { track: 'alarm', value: 75 } },
  },
  text: ['Тише.'],
  cooldownTicks: 1,
} as Flipper['lines'][number];

describe('HUD logic', () => {
  it('maps highest track to four Flipper states', () => {
    expect(getFlipperMood({ alarm: 0 })).toBe('sleeping');
    expect(getFlipperMood({ alarm: 30 })).toBe('alert');
    expect(getFlipperMood({ alarm: 60, logs: 10 })).toBe('growling');
    expect(getFlipperMood({ alarm: 85 })).toBe('barking');
  });

  it('uses alarm thresholds for meter status', () => {
    expect(getTrackStatus('alarm', 29)).toBe('calm');
    expect(getTrackStatus('alarm', 30)).toBe('warning');
    expect(getTrackStatus('alarm', 85)).toBe('danger');
  });

  it('selects matching content line no more than once per three ticks', () => {
    const event: GameEvent = { type: 'TrackChanged', track: 'alarm', from: 40, to: 78 };

    expect(findFlipperLine([alarmLine], event, state, 2, 3)).toBe(alarmLine);
    expect(findFlipperLine([alarmLine], event, state, 2, 5)).toBeUndefined();
  });
});
