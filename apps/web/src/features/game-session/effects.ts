import mitt from 'mitt';
import type { GameEvent, GameState } from '@zero-day/engine';

export type EngineEventEffect = {
  event: GameEvent;
  state: GameState;
};

type GameSessionEffectMap = {
  'engine-event': EngineEventEffect;
};

export const gameSessionEffects = mitt<GameSessionEffectMap>();

export function subscribeToGameEvents(listener: (effect: EngineEventEffect) => void): () => void {
  gameSessionEffects.on('engine-event', listener);
  return () => {
    gameSessionEffects.off('engine-event', listener);
  };
}
