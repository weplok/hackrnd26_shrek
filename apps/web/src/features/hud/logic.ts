import { evalCondition } from '@zero-day/engine';
import type { Case, Flipper, GameEvent, GameState } from '@zero-day/engine';
import type { MeterStatus } from '@zero-day/ui';

export type FlipperMood = 'sleeping' | 'alert' | 'growling' | 'barking';

type FlipperLine = Flipper['lines'][number];
type TrackId = Case['tracks'][number]['id'];

export function hasFlipperJoined(flags: GameState['flags'], level: number): boolean {
  return flags.flipperJoined || level >= 2;
}

export function getFlipperMood(tracks: Readonly<Record<string, number>>): FlipperMood {
  const highestTrack = Math.max(0, ...Object.values(tracks));
  if (highestTrack >= 85) return 'barking';
  if (highestTrack >= 60) return 'growling';
  if (highestTrack >= 30) return 'alert';
  return 'sleeping';
}

export function getTrackStatus(track: TrackId, value: number): MeterStatus {
  if (track === 'alarm') {
    if (value >= 85) return 'danger';
    if (value >= 30) return 'warning';
  }
  return 'calm';
}

export function findFlipperLine(
  lines: readonly FlipperLine[],
  event: GameEvent,
  state: GameState,
  level: number,
  lastSpokenTick: number | undefined,
): FlipperLine | undefined {
  return lines.find((line) => {
    if (lastSpokenTick !== undefined && state.tick - lastSpokenTick < Math.max(3, line.cooldownTicks)) return false;
    if (line.trigger.event !== event.type) return false;
    if (line.minLevel !== undefined && level < line.minLevel) return false;
    if (line.maxLevel !== undefined && level > line.maxLevel) return false;
    if (line.trigger.when && !evalCondition(line.trigger.when, state)) return false;
    return true;
  });
}

export function getFlipperText(line: FlipperLine, tick: number): string {
  return line.text[tick % line.text.length] ?? line.text[0] ?? '';
}
