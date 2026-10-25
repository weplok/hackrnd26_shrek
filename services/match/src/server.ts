// Real-time duel WebSocket server. One authoritative DuelState per room, a
// 10 Hz tick loop broadcasting each side its own projection (fog of war).
import { WebSocketServer, type WebSocket } from 'ws';
import {
  blueIsolate,
  blueMove,
  createDuel,
  project,
  redCommand,
  redLayLow,
  tick,
} from './match.ts';
import type { ClientMsg, DuelState, Role, ServerMsg } from './types.ts';

const PORT = Number(process.env.MATCH_PORT ?? 8090);
const TICK_MS = 100;

interface Room {
  state: DuelState;
  sockets: Partial<Record<Role, WebSocket>>;
  timer: ReturnType<typeof setInterval> | null;
  last: number;
}

const rooms = new Map<string, Room>();

function send(ws: WebSocket | undefined, msg: ServerMsg): void {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function loop(id: string, room: Room): void {
  const now = Date.now();
  const dt = now - room.last;
  room.last = now;
  const ended = tick(room.state, dt);
  for (const role of ['red', 'blue'] as Role[]) send(room.sockets[role], { t: 'tick', view: project(room.state, role) });
  if (ended) {
    const { winner, reason } = room.state;
    for (const role of ['red', 'blue'] as Role[]) send(room.sockets[role], { t: 'over', winner: winner!, reason: reason! });
    if (room.timer) clearInterval(room.timer);
    rooms.delete(id);
  }
}

function getRoom(id: string): Room {
  let room = rooms.get(id);
  if (!room) {
    room = { state: createDuel(), sockets: {}, timer: null, last: Date.now() };
    room.timer = setInterval(() => loop(id, room!), TICK_MS);
    rooms.set(id, room);
  }
  return room;
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  let room: Room | null = null;
  let role: Role | null = null;

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw)) as ClientMsg;
    } catch {
      return send(ws, { t: 'error', msg: 'bad json' });
    }

    if (msg.t === 'join') {
      room = getRoom(msg.room);
      role = msg.role;
      if (room.sockets[role] && room.sockets[role] !== ws) return send(ws, { t: 'error', msg: `${role} taken` });
      room.sockets[role] = ws;
      const opponent: Role = role === 'red' ? 'blue' : 'red';
      send(ws, { t: 'joined', role, caseId: room.state.map.caseId, opponentKind: room.sockets[opponent] ? 'human' : null });
      return;
    }

    if (!room || !role) return send(ws, { t: 'error', msg: 'join first' });

    switch (msg.t) {
      case 'red_cmd':
        if (role !== 'red') return;
        return send(ws, { t: 'events', events: redCommand(room.state, msg.cmd) });
      case 'red_lay_low':
        if (role === 'red') redLayLow(room.state);
        return;
      case 'blue_move':
        if (role === 'blue') blueMove(room.state, msg.node);
        return;
      case 'blue_isolate':
        if (role === 'blue') blueIsolate(room.state, msg.node);
        return;
    }
  });

  ws.on('close', () => {
    if (room && role && room.sockets[role] === ws) delete room.sockets[role];
  });
});

console.log(`[match] duel server on ws://localhost:${PORT}`);
