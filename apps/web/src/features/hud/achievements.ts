import { create } from 'zustand';
import { evalCondition } from '@zero-day/engine';
import type { GameEvent } from '@zero-day/engine';
import { subscribeToGameEvents } from '../game-session';
import type { SaveRepository } from '../persistence';

type Condition = Parameters<typeof evalCondition>[0];

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  /** Engine event that can unlock it. */
  event: GameEvent['type'];
  /** Extra guard checked against the resulting state. */
  when?: Condition;
}

// Campaign-wide achievements. Each is announced once by Flipper, then stored.
export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first_blood', title: 'Первая кровь', desc: 'Взял первый узел сети.', event: 'NodeCompromised' },
  { id: 'tracker', title: 'Следопыт', desc: 'Нашёл первую улику.', event: 'CluesFound' },
  { id: 'locksmith', title: 'Ключник', desc: 'Собрал ключ из зацепок.', event: 'KeyAssembled' },
  { id: 'white_hat', title: 'Белая шляпа', desc: 'Отказался лезть за рамки договора.', event: 'ScopeDeclined' },
  { id: 'deeper', title: 'Глубже в сеть', desc: 'Пробился в закрытый сегмент.', event: 'SegmentOpened' },
  { id: 'ghost', title: 'Призрак', desc: 'Прошёл кейс незаметно: тревога ниже 30.', event: 'CaseWon', when: { maxAlarmBelow: 30 } },
  { id: 'contract_done', title: 'Контракт закрыт', desc: 'Довёл кейс до отчёта.', event: 'CaseWon' },
];

interface AchievementStore {
  unlocked: string[];
  latest: Achievement | null;
  seed: (ids: string[]) => void;
  unlock: (achievement: Achievement) => void;
  has: (id: string) => boolean;
}

export const useAchievements = create<AchievementStore>((set, get) => ({
  unlocked: [],
  latest: null,
  seed: (ids) => {
    set({ unlocked: [...new Set(ids)], latest: null });
  },
  unlock: (achievement) => {
    if (get().unlocked.includes(achievement.id)) return;
    set((s) => ({ unlocked: [...s.unlocked, achievement.id], latest: achievement }));
  },
  has: (id) => get().unlocked.includes(id),
}));

/** Watches game events, unlocks matching achievements, announces and persists them. */
export function startAchievements(repository: SaveRepository): () => void {
  const store = useAchievements.getState();
  store.seed(repository.load().save.achievements);

  return subscribeToGameEvents(({ event, state }) => {
    const earned = ACHIEVEMENTS.filter(
      (a) => a.event === event.type && !useAchievements.getState().has(a.id) && evalCondition(a.when, state),
    );
    for (const achievement of earned) {
      useAchievements.getState().unlock(achievement);
      repository.update((save) => ({
        ...save,
        achievements: [...new Set([...save.achievements, achievement.id])],
      }));
    }
  });
}
