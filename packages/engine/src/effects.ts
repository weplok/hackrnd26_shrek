// Apply content Effects to game state (mutating a draft). Pure helpers.
import type { Effect, GameState, Content } from "./types.ts";

export function applyEffects(effects: Effect[] | undefined, s: GameState, content: Content): void {
  if (!effects) return;
  for (const eff of effects) applyEffect(eff as any, s, content);
}

function applyEffect(e: any, s: GameState, content: Content): void {
  if ("revealNodes" in e) {
    for (const id of e.revealNodes) if (s.nodes[id]) s.nodes[id].revealed = true;
  } else if ("grantClues" in e) {
    for (const id of e.grantClues) {
      if (!s.clues[id]) { s.clues[id] = true; s.log.push({ t: `улика: ${id}`, kind: "clue" }); }
    }
  } else if ("openSegment" in e) {
    s.segmentsOpen[e.openSegment] = true;
    s.log.push({ t: `открыт сегмент: ${e.openSegment}`, kind: "sys" });
  } else if ("setFlag" in e) {
    s.flags[e.setFlag] = true;
  } else if ("addTrack" in e) {
    const cur = s.tracks[e.addTrack.track] ?? 0;
    s.tracks[e.addTrack.track] = clamp(cur + e.addTrack.delta);
  } else if ("unlockCodex" in e) {
    if (!s.codex[e.unlockCodex]) {
      s.codex[e.unlockCodex] = true;
      s.log.push({ t: `Кодекс: открыта карточка ${e.unlockCodex}`, kind: "ok" });
    }
  } else if ("flipperSay" in e) {
    // handled by UI layer via flipper content; log for headless mode
    s.log.push({ t: `Флиппер: ${e.flipperSay}`, kind: "flipper" });
  } else if ("completeObjective" in e) {
    s.objectives[e.completeObjective] = true;
  }
}

export function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}
