import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@zero-day/ui';
import { ru } from '../../shared/ui/strings';
import type { GameProps } from './game';

type Cell = [number, number];
type Status = 'ready' | 'run' | 'won' | 'lost';
type World = { snake: Cell[]; dir: Cell; next: Cell; pac: Cell; pacPrev: Cell; apples: Cell[]; grow: number; tick: number };

const text = ru.puzzle;
const MAZES = [
  [
    '#################',
    '#S....#...#.....#',
    '#.##..#.#.#.###.#',
    '#.#.....#.....#A#',
    '#.#.###.###.#.#.#',
    '#...#A..P...#...#',
    '###.#.##.##.###.#',
    '#.....#...#.....#',
    '#.###.#.#.#.###.#',
    '#A......#......F#',
    '#################',
  ],
  [
    '#################',
    '#S..#.....#....A#',
    '#.#.#.###.#.##..#',
    '#.#...#.....#..##',
    '#.###.#.###.#.#.#',
    '#...#...P.#...#.#',
    '#.#.###.#.###.#.#',
    '#A#.....#.....#.#',
    '#.#####.#.###.#.#',
    '#.......#..A#..F#',
    '#################',
  ],
  [
    '#################',
    '#S.......#......#',
    '#.#####.##.####.#',
    '#.#A..#....#..#.#',
    '#.#.#.####.#.##.#',
    '#...#...P....#..#',
    '###.###.##.#.#.##',
    '#.....#..#.#....#',
    '#.###.##.#.####.#',
    '#...A#..A.....#F#',
    '#################',
  ],
  [
    '#################',
    '#S#.....#.....#A#',
    '#.#.###.#.###.#.#',
    '#...#.....#.....#',
    '###.#.##P##.#.###',
    '#A..#.......#...#',
    '#.###.#####.###.#',
    '#.....#...#.....#',
    '#.###.#.#.#.###.#',
    '#...#...#A..#..F#',
    '#################',
  ],
  [
    '#################',
    '#S....#.A.#.....#',
    '####.##.#.#.###.#',
    '#....#..#...#...#',
    '#.##.#.###.##.#.#',
    '#.#....#P#....#.#',
    '#.#.##.#.#.##.#.#',
    '#.#A.#.....#..#A#',
    '#.####.###.#.##.#',
    '#............#.F#',
    '#################',
  ],
];
const W = MAZES[0]?.[0]?.length ?? 0;
const H = MAZES[0]?.length ?? 0;
const STEP_MS = 300;
const PAC_EVERY = 2;
const START_LENGTH = 3;
const DIRS: Cell[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const KEYS: Record<string, Cell> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};

const same = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1];

type Level = { maze: string[]; start: Cell; pacStart: Cell; finish: Cell; apples: Cell[]; walls: Cell[] };

function buildLevel(maze: string[]): Level {
  const find = (ch: string): Cell[] => {
    const cells: Cell[] = [];
    maze.forEach((row, y) => Array.from(row).forEach((c, x) => c === ch && cells.push([x, y])));
    return cells;
  };
  return {
    maze,
    start: find('S')[0] ?? [1, 1],
    pacStart: find('P')[0] ?? [8, 5],
    finish: find('F')[0] ?? [15, 9],
    apples: find('A'),
    walls: find('#'),
  };
}

const LEVELS = MAZES.map(buildLevel);
const isWall = (level: Level, [x, y]: Cell): boolean => (level.maze[y]?.[x] ?? '#') === '#';

function freshWorld(level: Level): World {
  return {
    snake: Array.from({ length: START_LENGTH }, (): Cell => [...level.start]),
    dir: [1, 0],
    next: [1, 0],
    pac: [...level.pacStart],
    pacPrev: [...level.pacStart],
    apples: level.apples.map((a): Cell => [...a]),
    grow: 0,
    tick: 0,
  };
}

const snapshot = (world: World): World => ({ ...world, snake: [...world.snake], apples: [...world.apples] });

/** Random step that never goes straight back, unless the antivirus is in a dead end. */
function wander(level: Level, world: World): void {
  const open = DIRS.map(([dx, dy]): Cell => [world.pac[0] + dx, world.pac[1] + dy]).filter((cell) => !isWall(level, cell));
  const forward = open.filter((cell) => !same(cell, world.pacPrev));
  const choices = forward.length > 0 ? forward : open;
  const next = choices[Math.floor(Math.random() * choices.length)];
  if (!next) return;
  world.pacPrev = world.pac;
  world.pac = next;
}

function advance(level: Level, world: World): Status {
  const [nx, ny] = world.next;
  if (nx !== -world.dir[0] || ny !== -world.dir[1]) world.dir = world.next;
  const head = world.snake[0] ?? level.start;
  const target: Cell = [head[0] + world.dir[0], head[1] + world.dir[1]];
  if (!isWall(level, target)) {
    world.snake.unshift(target);
    const apple = world.apples.findIndex((a) => same(a, target));
    if (apple >= 0) {
      world.apples.splice(apple, 1);
      world.grow += 1;
    }
    if (world.grow > 0) world.grow -= 1;
    else world.snake.pop();
  }
  world.tick += 1;
  if (world.tick % PAC_EVERY === 0) wander(level, world);
  if (world.snake.some((seg) => same(seg, world.pac))) return 'lost';
  if (world.apples.length === 0 && same(world.snake[0] ?? level.start, level.finish)) return 'won';
  return 'run';
}

export function VirusMaze({ puzzle, onCancel, onSubmit }: GameProps): ReactNode {
  const [level] = useState(() => LEVELS[Math.floor(Math.random() * LEVELS.length)] ?? buildLevel(MAZES[0] ?? []));
  const world = useRef<World>(freshWorld(level));
  const submit = useRef(onSubmit);
  const [status, setStatus] = useState<Status>('ready');
  const [view, setView] = useState<World>(() => freshWorld(level));

  useEffect(() => {
    submit.current = onSubmit;
  });

  useEffect(() => {
    if (status !== 'run') return;
    const timer = setInterval(() => {
      const next = advance(level, world.current);
      setView(snapshot(world.current));
      if (next === 'run') return;
      setStatus(next);
      if (next === 'lost') submit.current([]);
      else setTimeout(() => submit.current(puzzle.correct), 700);
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [status, puzzle.correct, level]);

  useEffect(() => {
    if (status !== 'run') return;
    const onKey = (event: KeyboardEvent): void => {
      const dir = KEYS[event.code];
      if (!dir) return;
      event.preventDefault();
      world.current.next = dir;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status]);

  useEffect(() => {
    if (status === 'run' || status === 'won') return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' && event.code !== 'Enter' && event.code !== 'NumpadEnter') return;
      event.preventDefault();
      start();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status]);

  function start(): void {
    world.current = freshWorld(level);
    setView(snapshot(world.current));
    setStatus('run');
  }

  const { snake, pac, apples } = view;
  const armed = apples.length === 0;

  return (
    <div className="virus-maze">
      <p className="puzzle-host__prompt">{text.virusRules}</p>
      <svg className="virus-maze__field" viewBox={`0 0 ${String(W)} ${String(H)}`} role="img" aria-label={text.virusField}>
        {level.walls.map(([x, y]) => (
          <rect className="virus-maze__wall" height="1" key={`${String(x)}:${String(y)}`} width="1" x={x} y={y} />
        ))}
        <rect className={`virus-maze__finish${armed ? ' virus-maze__finish--armed' : ''}`} height="0.8" width="0.8" x={level.finish[0] + 0.1} y={level.finish[1] + 0.1} />
        {apples.map(([x, y]) => (
          <circle className="virus-maze__apple" cx={x + 0.5} cy={y + 0.5} key={`${String(x)}:${String(y)}`} r="0.3" />
        ))}
        {snake.map(([x, y], i) => (
          <rect
            className={`virus-maze__snake${i === 0 ? ' virus-maze__snake--head' : ''}`}
            height="0.84"
            key={i}
            rx="0.2"
            width="0.84"
            x={x + 0.08}
            y={y + 0.08}
          />
        ))}
        <path className="virus-maze__pac" d={`M${String(pac[0] + 0.5)},${String(pac[1] + 0.5)} l0.4,-0.25 a0.45,0.45 0 1,0 0,0.5 z`} />
      </svg>
      <div className="virus-maze__pad">
        {(['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'] as const).map((code) => (
          <button
            aria-label={text.virusMove[code]}
            className={`virus-maze__key virus-maze__key--${code}`}
            disabled={status !== 'run'}
            key={code}
            onClick={() => {
              world.current.next = KEYS[code] ?? world.current.next;
            }}
            type="button"
          >
            {{ ArrowUp: '▲', ArrowLeft: '◀', ArrowDown: '▼', ArrowRight: '▶' }[code]}
          </button>
        ))}
      </div>
      <p className="puzzle-host__attempts">
        {status === 'won' ? text.virusWon : status === 'lost' ? text.virusLost : text.virusApples(level.apples.length - apples.length, level.apples.length)}
      </p>
      <p className="puzzle-host__attempts">{text.attempts(puzzle.attemptsLeft)}</p>
      <div className="puzzle-actions">
        <Button onClick={onCancel} type="button" variant="ghost">
          {text.cancel}
        </Button>
        <Button disabled={status === 'run' || status === 'won'} onClick={start} type="button" variant="primary">
          {status === 'lost' ? text.retry : text.start}
        </Button>
      </div>
    </div>
  );
}
