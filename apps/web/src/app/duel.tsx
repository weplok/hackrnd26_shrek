// Duel screen: lobby + live Red/Blue view over the match WebSocket.
// Red reuses the campaign engine (scan to start); Blue is an arcade patrol on a
// canvas of the same node graph. Full Red puzzle UI is a follow-up.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Panel } from '@zero-day/ui';
import { content } from '../content';

const DUEL_CASE = 'L3C1';

type Role = 'red' | 'blue';
interface Vec2 {
  x: number;
  y: number;
}
interface BluePatrol {
  at: Vec2;
  from: string;
  to: string;
  isolateCooldown: number;
}
interface BlueView {
  role: 'blue';
  blue: BluePatrol;
  footprints: Record<string, number>;
  detection: number;
  activeExploit: string | null;
  isolated: string[];
}
interface RedView {
  role: 'red';
  red: { nodes: Record<string, { revealed: boolean; scanned: boolean; compromised: boolean }>; activePuzzle: { nodeId: string } | null };
  detection: number;
  bluePresence: string | null;
}
type View = RedView | BlueView;
type ServerMsg =
  | { t: 'joined'; role: Role; caseId: string; opponentKind: string | null }
  | { t: 'tick'; view: View }
  | { t: 'over'; winner: Role; reason: string }
  | { t: 'error'; msg: string };

const caseDef = content.cases[DUEL_CASE]!;
const NODES = caseDef.nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind, x: n.position.x, y: n.position.y }));
const ADJ: Record<string, string[]> = {};
for (const n of NODES) ADJ[n.id] = [];
for (const e of caseDef.edges ?? []) {
  ADJ[e.from]?.push(e.to);
  ADJ[e.to]?.push(e.from);
}

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws/duel`;
}

export function DuelPage(): ReactNode {
  const [role, setRole] = useState<Role | null>(null);
  const [room, setRoom] = useState('demo');
  const [status, setStatus] = useState<'lobby' | 'connecting' | 'playing' | 'over'>('lobby');
  const [view, setView] = useState<View | null>(null);
  const [result, setResult] = useState<{ winner: Role; reason: string } | null>(null);
  const [opponent, setOpponent] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => () => wsRef.current?.close(), []);

  function join(pick: Role): void {
    setRole(pick);
    setStatus('connecting');
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', room, role: pick }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as ServerMsg;
      if (msg.t === 'joined') {
        setStatus('playing');
        setOpponent(msg.opponentKind);
      } else if (msg.t === 'tick') setView(msg.view);
      else if (msg.t === 'over') {
        setResult({ winner: msg.winner, reason: msg.reason });
        setStatus('over');
      }
    };
    ws.onclose = () => setStatus((s) => (s === 'over' ? s : 'lobby'));
  }

  function send(payload: unknown): void {
    wsRef.current?.send(JSON.stringify(payload));
  }

  if (status === 'lobby' || status === 'connecting') {
    return (
      <Panel>
        <h1>Дуэль · Red vs Blue</h1>
        <p>Карта: {DUEL_CASE}. Red ломает узел-цель, Blue патрулирует и ловит по следам.</p>
        <label>
          Комната{' '}
          <input value={room} maxLength={16} onChange={(e) => setRoom(e.target.value)} placeholder="demo" />
        </label>
        <div className="actions" style={{ marginTop: 16 }}>
          <Button variant="primary" disabled={status === 'connecting'} onClick={() => join('red')}>
            Играть за Red (атака)
          </Button>
          <Button disabled={status === 'connecting'} onClick={() => join('blue')}>
            Играть за Blue (защита)
          </Button>
        </div>
        {status === 'connecting' && <p>Подключение…</p>}
      </Panel>
    );
  }

  if (status === 'over' && result) {
    const win = result.winner === role;
    return (
      <Panel>
        <h1>{win ? 'Победа' : 'Поражение'}</h1>
        <p>
          Победил {result.winner === 'red' ? 'Red (атака)' : 'Blue (защита)'} — {result.reason}
        </p>
        <Button variant="primary" onClick={() => location.reload()}>
          В лобби
        </Button>
      </Panel>
    );
  }

  const detection = view?.detection ?? 0;
  return (
    <Panel>
      <h1>Дуэль — ты {role === 'red' ? 'Red (атака)' : 'Blue (защита)'}</h1>
      <p>Соперник: {opponent === 'human' ? 'человек' : opponent === 'ai' ? 'ИИ' : 'ждём…'}</p>
      <DetectionBar value={detection} />
      {role === 'blue' && view?.role === 'blue' ? (
        <BlueBoard view={view} onMove={(node) => send({ t: 'blue_move', node })} onIsolate={(node) => send({ t: 'blue_isolate', node })} />
      ) : view?.role === 'red' ? (
        <RedBoard view={view} onScan={(node) => send({ t: 'red_cmd', cmd: { type: 'ScanNode', node } })} />
      ) : (
        <p>Ожидание состояния…</p>
      )}
    </Panel>
  );
}

function DetectionBar({ value }: { value: number }): ReactNode {
  return (
    <div style={{ margin: '12px 0' }}>
      <div>Обнаружение: {Math.round(value)}%</div>
      <div style={{ height: 10, background: '#222', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: value > 60 ? '#e44' : '#4ad' }} />
      </div>
    </div>
  );
}

const W = 640;
const H = 420;
const px = (x: number): number => (x / 100) * W;
const py = (y: number): number => (y / 100) * H;

function BlueBoard({ view, onMove, onIsolate }: { view: BlueView; onMove: (n: string) => void; onIsolate: (n: string) => void }): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#345';
    for (const e of caseDef.edges ?? []) {
      const a = NODES.find((n) => n.id === e.from)!;
      const b = NODES.find((n) => n.id === e.to)!;
      ctx.beginPath();
      ctx.moveTo(px(a.x), py(a.y));
      ctx.lineTo(px(b.x), py(b.y));
      ctx.stroke();
    }
    for (const n of NODES) {
      const fp = view.footprints[n.id] ?? 0;
      const isolated = view.isolated.includes(n.id);
      ctx.beginPath();
      ctx.arc(px(n.x), py(n.y), 10 + Math.min(fp, 20) * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = n.id === view.activeExploit ? '#e44' : isolated ? '#555' : fp > 0 ? '#dd4' : '#2a6';
      ctx.fill();
      ctx.fillStyle = '#cde';
      ctx.font = '10px monospace';
      ctx.fillText(n.label, px(n.x) + 12, py(n.y) + 3);
    }
    ctx.beginPath();
    ctx.arc(px(view.blue.at.x), py(view.blue.at.y), 8, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }, [view]);

  const reachable = new Set(ADJ[view.blue.to] ?? []);
  function click(ev: React.MouseEvent<HTMLCanvasElement>): void {
    const rect = ev.currentTarget.getBoundingClientRect();
    const mx = ((ev.clientX - rect.left) / rect.width) * W;
    const my = ((ev.clientY - rect.top) / rect.height) * H;
    const hit = NODES.find((n) => Math.hypot(px(n.x) - mx, py(n.y) - my) < 16);
    if (hit && reachable.has(hit.id)) onMove(hit.id);
  }
  return (
    <div>
      <canvas ref={canvasRef} width={W} height={H} style={{ width: '100%', maxWidth: W, border: '1px solid #345', cursor: 'pointer' }} onClick={click} />
      <p>Клик по соседнему узлу — ехать туда. Ешь жёлтые следы, лови красный узел (активный эксплойт).</p>
      <Button disabled={view.blue.isolateCooldown > 0} onClick={() => onIsolate(view.blue.to)}>
        Изолировать текущий узел {view.blue.isolateCooldown > 0 ? `(${Math.ceil(view.blue.isolateCooldown / 1000)}с)` : ''}
      </Button>
    </div>
  );
}

function RedBoard({ view, onScan }: { view: RedView; onScan: (n: string) => void }): ReactNode {
  return (
    <div>
      <p>Сканируй узлы, ищи путь к цели. (Полный UI пазлов — следующим шагом.)</p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {NODES.map((n) => {
          const rt = view.red.nodes[n.id];
          if (!rt?.revealed) return null;
          return (
            <li key={n.id} style={{ margin: '4px 0' }}>
              <Button onClick={() => onScan(n.id)}>Скан: {n.label}</Button>{' '}
              {rt.compromised ? '✓ взят' : rt.scanned ? 'просканирован' : ''}
              {view.red.activePuzzle?.nodeId === n.id ? ' · пазл активен' : ''}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
