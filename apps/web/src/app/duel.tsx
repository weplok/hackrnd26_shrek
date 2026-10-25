// Duel screen: both sides play on the same node graph. Red scans and attacks
// nodes (engine puzzles) to reach the target; Blue hardens nodes by solving the
// same puzzle archetype as a defence. Both use the shared PuzzlePanel.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Modal, Panel } from '@zero-day/ui';
import type { GameState, PuzzleInstance } from '@zero-day/engine';
import { PuzzlePanel } from '../features/puzzle-host';
import { content } from '../content';
import { audio } from '../shared/audio/audio';
import { ru } from '../shared/ui/strings';

const DUEL_CASE = 'L3C1';
type Role = 'red' | 'blue';

interface RedView {
  role: 'red';
  red: GameState;
  secured: string[];
  detection: number;
}
interface BlueView {
  role: 'blue';
  puzzle: PuzzleInstance | null;
  puzzleNode: string | null;
  compromised: string[];
  underAttack: string | null;
  secured: string[];
  detection: number;
}
type View = RedView | BlueView;
type ServerMsg =
  | { t: 'joined'; role: Role; caseId: string; opponentKind: string | null }
  | { t: 'tick'; view: View }
  | { t: 'over'; winner: Role; reason: string }
  | { t: 'error'; msg: string };

const caseDef = content.cases[DUEL_CASE]!;
const NODES = caseDef.nodes.map((n) => ({
  id: n.id,
  label: n.label,
  kind: n.kind,
  x: n.position.x,
  y: n.position.y,
  vulns: (n.exploits ?? []).map((e) => e.vuln),
}));
type Node = (typeof NODES)[number];
const nodeOf = (id: string): Node | undefined => NODES.find((n) => n.id === id);
const vulnName = (v: string): string => content.vulnerabilities[v]?.title ?? v;

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
  const [selected, setSelected] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => () => wsRef.current?.close(), []);
  useEffect(() => {
    if (result) (result.winner === role ? audio.playSuccess() : audio.playError());
  }, [result, role]);

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

  const send = (payload: unknown): void => wsRef.current?.send(JSON.stringify(payload));

  // The duel re-renders on every WS tick (10 Hz). Puzzle mini-games drive phase
  // timers from effects keyed on the puzzle object and their submit handler, so a
  // fresh identity each tick would reset those timers forever ("Проверка..." hangs).
  // Keep both stable: freeze the puzzle object until it actually changes, and give
  // the games one constant submit/cancel handler per role.
  const puzzleHold = useRef<PuzzleInstance | null>(null);
  const puzzleKeyRef = useRef<string | null>(null);
  const submitPuzzle = useCallback(
    (answer: string[]) =>
      wsRef.current?.send(JSON.stringify(role === 'red' ? { t: 'red_cmd', cmd: { type: 'SubmitPuzzle', answer } } : { t: 'blue_submit', answer })),
    [role],
  );
  const cancelPuzzle = useCallback(
    () => wsRef.current?.send(JSON.stringify(role === 'red' ? { t: 'red_cmd', cmd: { type: 'CancelPuzzle' } } : { t: 'blue_cancel' })),
    [role],
  );

  if (status === 'lobby' || status === 'connecting') {
    return (
      <Panel>
        <h1>Дуэль · Red vs Blue</h1>
        <p>Карта {DUEL_CASE}. Red ломает узлы до цели, Blue патчит узлы — защита решается тем же пазлом, что и атака.</p>
        <label>
          Комната <input value={room} maxLength={16} onChange={(e) => setRoom(e.target.value)} placeholder="demo" />
        </label>
        <div className="actions" style={{ marginTop: 16 }}>
          <Button variant="primary" disabled={status === 'connecting'} onClick={() => join('red')}>
            Red · атака
          </Button>
          <Button disabled={status === 'connecting'} onClick={() => join('blue')}>
            Blue · защита
          </Button>
        </div>
        {status === 'connecting' && <p>Подключение…</p>}
      </Panel>
    );
  }

  if (status === 'over' && result) {
    const win = result.winner === role;
    const reason =
      result.reason === 'target-reached' ? 'Red дошёл до цели' : result.reason === 'caught' ? 'Red вычислен (тревога 100%)' : 'Blue удержал оборону до конца раунда';
    return (
      <Panel>
        <h1>{win ? 'Победа' : 'Поражение'}</h1>
        <p>Победил {result.winner === 'red' ? 'Red (атака)' : 'Blue (защита)'} — {reason}</p>
        <Button variant="primary" onClick={() => location.reload()}>
          В лобби
        </Button>
      </Panel>
    );
  }

  if (!view) return <Panel><p>Ожидание состояния…</p></Panel>;

  const redView = view.role === 'red' ? view : null;
  const blueView = view.role === 'blue' ? view : null;
  const sel = selected ? nodeOf(selected) : null;
  const rawPuzzle = redView?.red.activePuzzle ?? blueView?.puzzle ?? null;
  const puzzleKey = rawPuzzle ? `${rawPuzzle.nodeId}:${rawPuzzle.vuln}:${rawPuzzle.attemptsLeft}:${rawPuzzle.archetype}` : null;
  if (puzzleKey !== puzzleKeyRef.current) {
    puzzleKeyRef.current = puzzleKey;
    puzzleHold.current = rawPuzzle;
  }
  const activePuzzle = puzzleHold.current;

  function nodeState(n: Node): { color: string; hint: string } {
    const secured = view!.secured.includes(n.id);
    if (redView) {
      const rt = redView.red.nodes[n.id];
      if (rt?.compromised) return { color: '#e44', hint: 'взят' };
      if (secured) return { color: '#48f', hint: 'защищён' };
      if (!rt?.revealed) return { color: '#334', hint: 'скрыт' };
      if (rt.scanned) return { color: '#dd4', hint: 'скан' };
      return { color: '#2a6', hint: 'открыт' };
    }
    if (blueView!.compromised.includes(n.id)) return { color: '#e44', hint: 'взят Red' };
    if (secured) return { color: '#48f', hint: 'защищён' };
    if (blueView!.underAttack === n.id) return { color: '#f82', hint: 'атакуется!' };
    return { color: '#2a6', hint: '' };
  }

  function menu(n: Node): ReactNode {
    if (redView) {
      const rt = redView.red.nodes[n.id];
      const secured = redView.secured.includes(n.id);
      return (
        <>
          <Button onClick={() => send({ t: 'red_cmd', cmd: { type: 'ScanNode', node: n.id } })}>Скан</Button>
          {rt?.scanned &&
            n.vulns.map((v) => (
              <Button key={v} disabled={secured} onClick={() => send({ t: 'red_cmd', cmd: { type: 'ProposeHypothesis', node: n.id, vuln: v } })}>
                Атака: {vulnName(v)}
              </Button>
            ))}
          {secured && <span> · узел защищён, атака отбита</span>}
        </>
      );
    }
    return (
      <>
        {n.vulns.length === 0 && <span>нет уязвимостей для патча</span>}
        {n.vulns.map((v) => (
          <Button key={v} onClick={() => send({ t: 'blue_patch', node: n.id, vuln: v })}>
            Патч: {vulnName(v)}
          </Button>
        ))}
      </>
    );
  }

  return (
    <Panel>
      <h1>Дуэль — {role === 'red' ? 'Red · атака' : 'Blue · защита'}</h1>
      <p>Соперник: {opponent === 'human' ? 'человек' : opponent === 'ai' ? 'ИИ' : 'ждём второго игрока…'} · Цель: {nodeOf(caseDefTarget())?.label}</p>
      <DetectionBar value={view.detection} role={role!} />
      <GraphBoard selected={selected} onSelect={setSelected} stateOf={nodeState} />
      {sel && (
        <div style={{ marginTop: 12 }}>
          <strong>{sel.label}</strong> — {nodeState(sel).hint}
          <div className="actions" style={{ marginTop: 6, flexWrap: 'wrap' }}>{menu(sel)}</div>
        </div>
      )}
      {activePuzzle && (
        <Modal
          isOpen
          closeLabel={ru.puzzle.close}
          title={role === 'red' ? ru.puzzle.running(activePuzzle.title) : `Защита: ${activePuzzle.title}`}
          onClose={cancelPuzzle}
        >
          <PuzzlePanel puzzle={activePuzzle} onCancel={cancelPuzzle} onSubmit={submitPuzzle} />
        </Modal>
      )}
    </Panel>
  );
}

function caseDefTarget(): string {
  return caseDef.nodes.find((n) => n.kind === 'target')?.id ?? caseDef.nodes.at(-1)!.id;
}

function DetectionBar({ value, role }: { value: number; role: Role }): ReactNode {
  return (
    <div style={{ margin: '12px 0' }}>
      <div>Тревога: {Math.round(value)}% {role === 'blue' ? '(100 = Red пойман, победа Blue)' : '(не доводи до 100)'}</div>
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

function GraphBoard({
  selected,
  onSelect,
  stateOf,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
  stateOf: (n: Node) => { color: string; hint: string };
}): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#345';
    for (const e of caseDef.edges ?? []) {
      const a = nodeOf(e.from)!;
      const b = nodeOf(e.to)!;
      ctx.beginPath();
      ctx.moveTo(px(a.x), py(a.y));
      ctx.lineTo(px(b.x), py(b.y));
      ctx.stroke();
    }
    for (const n of NODES) {
      const { color } = stateOf(n);
      ctx.beginPath();
      ctx.arc(px(n.x), py(n.y), n.id === selected ? 13 : 10, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (n.id === selected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = '#345';
        ctx.lineWidth = 1;
      }
      ctx.fillStyle = '#cde';
      ctx.font = '10px monospace';
      ctx.fillText(n.label, px(n.x) + 13, py(n.y) + 3);
    }
  });

  function click(ev: React.MouseEvent<HTMLCanvasElement>): void {
    const rect = ev.currentTarget.getBoundingClientRect();
    const mx = ((ev.clientX - rect.left) / rect.width) * W;
    const my = ((ev.clientY - rect.top) / rect.height) * H;
    const hit = NODES.find((n) => Math.hypot(px(n.x) - mx, py(n.y) - my) < 16);
    if (hit) onSelect(hit.id);
  }
  return <canvas ref={canvasRef} width={W} height={H} style={{ width: '100%', maxWidth: W, border: '1px solid #345', cursor: 'pointer' }} onClick={click} />;
}
