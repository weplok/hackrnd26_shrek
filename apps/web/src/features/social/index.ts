import { create } from 'zustand';
import { socialOutcome } from '@zero-day/engine';
import type { Content } from '@zero-day/engine';
import { useCaseStore } from '../game-session';
import { createAnonymousSession } from '../../shared/session/createSession';
import { ru } from '../../shared/ui/strings';

export type SocialVerdict = 'continue' | 'ended' | 'noticed' | 'complete';
export type SocialMessage = { from: 'me' | 'npc' | 'sys'; text: string };
export type SocialChat = {
  npcId: string;
  sessionId: string;
  messages: SocialMessage[];
  trust: number | null;
  verdict: SocialVerdict;
  pending: boolean;
  unread: boolean;
};

type Chats = Record<string, SocialChat>;
export type SocialMode = 'ai' | 'classic';

const REPLY_TIMEOUT_MS = 190_000;

type SocialStore = {
  chats: Chats;
  openKey: string | null;
  mode: SocialMode;
  setMode: (mode: SocialMode) => void;
  open: (caseId: string, nodeId: string) => Promise<void>;
  close: () => void;
  send: (content: Content, caseId: string, nodeId: string, text: string) => Promise<void>;
  reset: () => void;
};

const t = ru.social;
// Sessions outlive the chat window and page reloads; only a level reset wipes them.
const storageKey = 'zero-day.social';

export const socialKey = (caseId: string, nodeId: string): string => `${caseId}:${nodeId}`;

function load(): Chats {
  try {
    const chats = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}') as Chats;
    for (const chat of Object.values(chats)) chat.pending = false;
    return chats;
  } catch {
    return {};
  }
}

function persist(chats: Chats): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(chats));
  } catch {
    // storage blocked: keep chats in memory only
  }
}

let npcIds: Promise<string[]> | null = null;

function fetchNpcIds(): Promise<string[]> {
  npcIds ??= fetch('/api/v1/npcs')
    .then(async (response) => {
      const payload = (await response.json()) as { npc_ids?: unknown };
      if (!response.ok || !Array.isArray(payload.npc_ids) || payload.npc_ids.length === 0) throw new Error('npcs');
      return payload.npc_ids.filter((id): id is string => typeof id === 'string');
    })
    .catch((error: unknown) => {
      npcIds = null;
      throw error;
    });
  return npcIds;
}

const caseNpcPrefix: Record<string, Record<string, string>> = {
  L2C1: { kostya: 'kostya', marina: 'maria', anton: 'anton' },
};

function pickNpc(ids: string[], taken: string[], prefix: string): string {
  const own = ids.filter((id) => new RegExp(`^${prefix}\\d+$`).test(id));
  const free = own.filter((id) => !taken.includes(id));
  const pool = free.length ? free : own;
  return pool[Math.floor(Math.random() * pool.length)] ?? '';
}

export const useSocial = create<SocialStore>((set, get) => {
  const update = (key: string, patch: Partial<SocialChat>): void => {
    const chat = get().chats[key];
    if (!chat) return;
    const chats = { ...get().chats, [key]: { ...chat, ...patch } };
    persist(chats);
    set({ chats });
  };

  return {
    chats: load(),
    openKey: null,
    mode: 'ai',
    setMode: (mode) => {
      set({ mode });
    },
    open: async (caseId, nodeId) => {
      const key = socialKey(caseId, nodeId);
      set({ openKey: key });
      if (get().chats[key]?.npcId) {
        update(key, { unread: false });
        return;
      }
      const taken = Object.entries(get().chats)
        .filter(([other]) => other.startsWith(`${caseId}:`))
        .map(([, chat]) => chat.npcId);
      const [ids, session] = await Promise.all([fetchNpcIds().catch(() => [] as string[]), createAnonymousSession()]);
      if (get().chats[key]?.npcId) return;
      const npcId = pickNpc(ids, taken, caseNpcPrefix[caseId]?.[nodeId] ?? 'emp');
      const chat: SocialChat = {
        npcId,
        sessionId: session.id,
        messages: npcId ? [] : [{ from: 'sys', text: t.offline }],
        trust: null,
        verdict: 'continue',
        pending: false,
        unread: false,
      };
      const chats = { ...get().chats, [key]: chat };
      if (npcId) persist(chats);
      set({ chats });
    },
    close: () => {
      set({ openKey: null });
    },
    send: async (content, caseId, nodeId, text) => {
      const key = socialKey(caseId, nodeId);
      const chat = get().chats[key];
      const message = text.trim();
      if (!chat?.npcId || !message || chat.pending || chat.verdict !== 'continue') return;
      update(key, { pending: true, messages: [...chat.messages, { from: 'me', text: message }] });

      let reply: SocialMessage;
      let verdict: SocialVerdict = 'continue';
      let trust = chat.trust;
      try {
        const response = await fetch('/dialogue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ npc_id: chat.npcId, uuid: chat.sessionId, message }),
          signal: AbortSignal.timeout(REPLY_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(String(response.status));
        const payload = (await response.json()) as { answer: string; verdict: SocialVerdict; trust_points: number };
        reply = { from: 'npc', text: payload.answer };
        verdict = payload.verdict;
        trust = payload.trust_points;
      } catch (error) {
        const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
        reply = { from: 'sys', text: timedOut ? t.unavailable : t.error };
      }

      // A level reset during the request drops the chat; its late answer must not resurrect it.
      const current = get().chats[key];
      if (current?.sessionId !== chat.sessionId) return;
      update(key, {
        pending: false,
        messages: [...current.messages, reply],
        trust,
        verdict,
        unread: get().openKey !== key,
      });

      if (verdict === 'continue') return;
      const caseRun = useCaseStore.getState().caseRun;
      if (caseRun?.caseId === caseId) {
        useCaseStore.setState({ caseRun: socialOutcome(content, caseRun, nodeId, verdict) });
      }
    },
    reset: () => {
      persist({});
      set({ chats: {}, openKey: null });
    },
  };
});
