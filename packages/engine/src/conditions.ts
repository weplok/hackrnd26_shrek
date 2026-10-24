// Condition tree evaluation over game state. The atom set is closed (TZ 6.2): a new atom needs engine code and a test.
import type { Condition, GameState } from './types.ts';

type NodeStateValue = Extract<Condition, { nodeState: unknown }>['nodeState']['state'];

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
  if ('npcFactRevealed' in c) return !!s.npc[c.npcFactRevealed.npc]?.revealedFacts[c.npcFactRevealed.fact];
  if ('trackBelow' in c) return (s.tracks[c.trackBelow.track] ?? 0) < c.trackBelow.value;
  if ('trackAbove' in c) return (s.tracks[c.trackAbove.track] ?? 0) > c.trackAbove.value;
  if ('maxAlarmBelow' in c) return s.maxAlarm < c.maxAlarmBelow;
  if ('scansBelow' in c) return s.scans < c.scansBelow;
  if ('lockFilled' in c) {
    const socks = s.sockets[c.lockFilled];
    return !!socks && Object.values(socks).every(Boolean);
  }
  if ('tickAtLeast' in c) return s.tick >= c.tickAtLeast;
  const unknown: never = c;
  throw new Error(`unknown condition atom: ${JSON.stringify(unknown)}`);
}

function nodeInState(s: GameState, nodeId: string, state: NodeStateValue): boolean {
  const n = s.nodes[nodeId];
  if (!n) return false;
  // FR-024: a revealed node of a closed segment is dim until the gateway is passed.
  const dim = n.revealed && s.segmentsOpen[n.segment] === false;
  switch (state) {
    case 'hidden':
      return !n.revealed;
    case 'visible':
      return n.revealed && !dim;
    case 'dim':
      return dim;
    case 'scanned':
      return n.scanned;
    case 'untouched':
      return n.revealed && !n.compromised;
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
  }
}
