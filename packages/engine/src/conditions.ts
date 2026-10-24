// Condition tree evaluation over game state.
import type { Condition, GameState } from './types.ts';

export function evalCondition(cond: Condition | undefined, s: GameState): boolean {
  if (!cond) return true;
  const c = cond;
  if ('all' in c) return c.all.every((x) => evalCondition(x, s));
  if ('any' in c) return c.any.some((x) => evalCondition(x, s));
  if ('not' in c) return !evalCondition(c.not, s);
  if ('nodeState' in c) return nodeInState(s, c.nodeState.node, c.nodeState.state);
  if ('hasClue' in c) return !!s.clues[c.hasClue];
  if ('hasKey' in c) return !!s.keys[c.hasKey];
  if ('segmentOpen' in c) return !!s.segmentsOpen[c.segmentOpen];
  if ('flag' in c) return !!s.flags[c.flag];
  if ('npcFactRevealed' in c) return !!s.npc[c.npcFactRevealed.npc]?.yielded;
  if ('trackBelow' in c) return (s.tracks[c.trackBelow.track] ?? 0) < c.trackBelow.value;
  if ('trackAbove' in c) return (s.tracks[c.trackAbove.track] ?? 0) > c.trackAbove.value;
  if ('lockFilled' in c) {
    const socks = s.sockets[c.lockFilled];
    return !!socks && Object.values(socks).every(Boolean);
  }
  if ('tickAtLeast' in c) return s.tick >= c.tickAtLeast;
  return false;
}

function nodeInState(s: GameState, nodeId: string, state: string): boolean {
  const n = s.nodes[nodeId];
  if (!n) return false;
  switch (state) {
    case 'hidden':
      return !n.revealed;
    case 'visible':
      return n.revealed;
    case 'dim':
      return !n.revealed;
    case 'scanned':
      return n.scanned;
    case 'untouched':
      return n.revealed && !n.scanned && !n.compromised;
    case 'compromised':
      return n.compromised;
    case 'secured':
      return n.secured;
    // track-coloured states approximated by alarm for UI conditions
    case 'calm':
      return (s.tracks.alarm ?? 0) < 35;
    case 'alerted':
      return (s.tracks.alarm ?? 0) >= 35 && (s.tracks.alarm ?? 0) < 75;
    case 'detected':
      return (s.tracks.alarm ?? 0) >= 75;
    default:
      return false;
  }
}
