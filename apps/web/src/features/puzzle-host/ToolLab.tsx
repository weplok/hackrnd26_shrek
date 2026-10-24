import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Panel } from '@zero-day/ui';
import { checkPuzzle, generatePuzzle, type PuzzleInstance } from '@zero-day/engine';
import { ru } from '../../shared/ui/strings';
import { PuzzlePanel } from './PuzzlePanel';

const TOOLS = ['scan', 'exploit', 'brute', 'phish', 'evasion', 'crypto', 'rootkit', 'wipe'] as const;
type Tool = (typeof TOOLS)[number];

const samples: Record<Tool, Record<string, unknown>> = {
  scan: { target: 'Учебный узел', ports: ['эхо: 443/tcp', 'эхо: 53/udp'], defense: 'пассивный фильтр' },
  exploit: { shape: 'Г-образный паз' },
  brute: { answer: 'barsik123', clues: ['Кличка кота', 'Год'], decoys: ['qwerty123', 'admin1234'] },
  phish: { blocks: ['Легенда: IT-подрядчик', 'Зацепка: заявка №17', 'Тон: спокойно и по делу'] },
  evasion: { path: ['Фрагмент A', 'Фрагмент B', 'Фрагмент C'] },
  crypto: { rotors: ['Ротор A: 7', 'Ротор B: 3', 'Ротор C: 9'] },
  rootkit: { profile: ['Процессор: 20%', 'Сеть: 10%', 'Файлы: 5%'] },
  wipe: { ownLines: ['auth: тестовая сессия', 'proxy: учебный маршрут'] },
};

const knobs = { attempts: 3, decoys: 2, falseEchoes: 2, fadeSteps: 1, contourComplexity: 3, towerHeight: 3, blockCount: 3, trustSensitivity: 3, beamCount: 4, gapWidth: 2, rotorCount: 3, hintCount: 2, parameterCount: 3, edrThreshold: 75, ownLines: 2, errorPenalty: 3 };

function createPuzzle(tool: Tool, seed: number): PuzzleInstance {
  return generatePuzzle(seed, tool, ru.puzzle.tool(tool), samples[tool], knobs, 'training', tool)[1];
}

export function ToolLab(): ReactNode {
  const [tool, setTool] = useState<Tool>('scan');
  const [seed, setSeed] = useState(7);
  const [result, setResult] = useState('');
  const puzzle = useMemo(() => createPuzzle(tool, seed), [seed, tool]);

  return (
    <section className="tool-lab" aria-label={ru.toolLab}>
      <Panel title={ru.toolLab}>
        <p className="copy">{ru.toolLabCopy}</p>
        <nav className="tool-lab__tools" aria-label={ru.puzzle.toolChoice}>
          {TOOLS.map((item) => (
            <Button
              key={item}
              onClick={() => {
                setTool(item);
                setResult('');
              }}
              type="button"
              variant={item === tool ? 'primary' : 'ghost'}
            >
              {ru.puzzle.tool(item)}
            </Button>
          ))}
        </nav>
        <PuzzlePanel
          puzzle={puzzle}
          onCancel={() => setResult(ru.puzzle.labCancelled)}
          onSubmit={(answer) => {
            if (checkPuzzle(puzzle, answer).solved) {
              setResult(ru.puzzle.labSolved);
              setSeed((current) => current + 1);
              return;
            }
            setResult(ru.puzzle.labFailed);
          }}
        />
        {result && <p className="puzzle-host__result" role="status">{result}</p>}
        <Link className="zd-button button-link" to="/">
          {ru.backToMenu}
        </Link>
      </Panel>
    </section>
  );
}
