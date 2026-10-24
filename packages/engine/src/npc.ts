// Scripted NPC dialogue resolution (MVP offline path; same design as live npc_api).
import type { NpcConfig, NpcRule, GameState } from './types.ts';

export interface NpcOutcome {
  suspicionDelta: number;
  replyKey: string;
  grant: string[];
  flipper?: string;
  matched: boolean;
}

export function resolveNpcTurn(cfg: NpcConfig, s: GameState, tone: string, selected: string[]): NpcOutcome {
  const has = (id: string) => !!s.clues[id] || !!s.keys[id] || selected.includes(id);
  for (const rule of cfg.rules) {
    if (matches(rule, tone, has)) {
      return {
        suspicionDelta: rule.then.suspicion,
        replyKey: rule.then.reply,
        grant: rule.then.grant ?? [],
        ...(rule.then.flipper !== undefined && { flipper: rule.then.flipper }),
        matched: true,
      };
    }
  }
  return { suspicionDelta: 8, replyKey: 'nervous', grant: [], matched: false };
}

function matches(rule: NpcRule, tone: string, has: (id: string) => boolean): boolean {
  const c = rule.if;
  if (c.tone && c.tone !== tone) return false;
  if (c.has_clue && !has(c.has_clue)) return false;
  if (c.has_key && !has(c.has_key)) return false;
  if (c.missing_clue && has(c.missing_clue)) return false;
  if (c.missing_key && has(c.missing_key)) return false;
  return true;
}
