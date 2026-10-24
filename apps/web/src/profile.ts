// Player profile persisted in localStorage (MVP save — T-C10 lite).
export interface Profile {
  nick: string;
  difficulty: "easy" | "med" | "hard";
  completed: Record<string, { rank: string; ticks: number; maxAlarm: number }>;
  codex: Record<string, boolean>;
  style: { tech: number; social: number };
}

export function defaultProfile(nick: string): Profile {
  return { nick, difficulty: "med", completed: {}, codex: {}, style: { tech: 0, social: 0 } };
}

export function loadProfile(nick: string): Profile | null {
  try {
    const raw = localStorage.getItem("zeroday_" + nick);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch { return null; }
}
export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem("zeroday_" + p.nick, JSON.stringify(p));
    localStorage.setItem("zeroday_last", p.nick);
  } catch { /* ignore */ }
}
export function lastNick(): string {
  try { return localStorage.getItem("zeroday_last") ?? ""; } catch { return ""; }
}
