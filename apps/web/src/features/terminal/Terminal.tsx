import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Case, GameEvent, Vulnerability } from '@zero-day/engine';
import { attackVuln } from '../attack-log';
import { subscribeToGameEvents, useCaseStore } from '../game-session';
import { useSocial } from '../social';
import { ru } from '../../shared/ui/strings';
import { complete, parseCommand, type ParseResult, type TerminalContext } from './parser';

const t = ru.terminal;

export interface TerminalProps {
  /** Open weakness catalog for the current case. */
  vulns: readonly Vulnerability[];
  /** Current case: attack commands need the node's kind and weaknesses. */
  caseData?: Case;
  onCodex?: (vuln: string) => void;
}

interface Line {
  id: number;
  kind: 'input' | 'output' | 'error';
  text: string;
}

function errorText(result: Extract<ParseResult, { type: 'error' }>): string {
  const token = result.token ?? '';
  switch (result.code) {
    case 'empty':
      return t.errors.empty;
    case 'usage':
      return t.errors.usage;
    default:
      return t.errors[result.code](token);
  }
}

export function eventText(event: GameEvent): string | null {
  switch (event.type) {
    case 'CommandRejected':
      return t.rejected[event.reason];
    case 'NodeScanned':
      return event.repeat ? t.rescanned(event.node) : t.scanned(event.node);
    case 'ScanOpened':
      return t.scanOpened(event.node);
    case 'NodesRevealed':
      return t.revealed(event.nodes.join(', '));
    case 'CluesFound':
      return t.clues(event.clues.length);
    case 'ScopeWarning':
      return t.scope(event.node);
    case 'PuzzleOpened':
      return t.puzzle(event.node, event.vuln);
    default:
      return null;
  }
}

export function Terminal({ vulns, caseData, onCodex }: TerminalProps): ReactNode {
  const inputId = useId();
  const nodes = useCaseStore((state) => state.caseRun?.nodes);
  const caseId = useCaseStore((state) => state.caseRun?.caseId);
  const dispatch = useCaseStore((state) => state.dispatch);
  const [value, setValue] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [hint, setHint] = useState('');
  const history = useRef<string[]>([]);
  const historyIndex = useRef(0);
  const nextId = useRef(0);

  const ctx = useMemo<TerminalContext>(
    () => ({
      nodes: Object.entries(nodes ?? {})
        .filter(([, node]) => node.revealed)
        .map(([id]) => id),
      vulns: vulns.map((vuln) => vuln.id),
    }),
    [nodes, vulns],
  );

  function print(kind: Line['kind'], texts: string[]): void {
    setLines((prev) => [...prev, ...texts.map((text) => ({ id: nextId.current++, kind, text }))].slice(-200));
  }

  // Map actions dispatch outside the terminal; the log mirrors every engine event.
  useEffect(
    () =>
      subscribeToGameEvents(({ event }) => {
        const text = eventText(event);
        if (text !== null) print(event.type === 'CommandRejected' ? 'error' : 'output', [text]);
      }),
    [],
  );

  function run(input: string): void {
    print('input', [`> ${input}`]);
    const result = parseCommand(input, ctx);
    switch (result.type) {
      case 'error':
        print('error', [errorText(result)]);
        return;
      case 'help':
        print('output', [...t.help]);
        return;
      case 'codex':
        print('output', [t.codex(result.vuln, vulns.find((vuln) => vuln.id === result.vuln)?.title ?? '')]);
        onCodex?.(result.vuln);
        return;
      case 'attack': {
        const node = caseData?.nodes.find((item) => item.id === result.node);
        const person = node?.kind === 'person';
        if (result.attack === 'social') {
          if (person && caseId) void useSocial.getState().open(caseId, result.node);
          else print('error', [t.notPerson(result.node)]);
          return;
        }
        const vuln = node && !person ? attackVuln(vulns, result.attack, node.exploits.map((e) => e.vuln)) : undefined;
        if (!vuln) {
          print('error', [person ? t.personOnlySocial(result.node) : t.rejected['not-exploitable']]);
          return;
        }
        if (!dispatch({ type: 'ProposeHypothesis', node: result.node, vuln })) print('error', [t.rejected['not-playing']]);
        return;
      }
      case 'scan':
      case 'hypothesis': {
        const step = dispatch(
          result.type === 'scan'
            ? { type: 'ScanNode', node: result.node }
            : { type: 'ProposeHypothesis', node: result.node, vuln: result.vuln },
        );
        if (!step) print('error', [t.rejected['not-playing']]);
      }
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Tab') {
      event.preventDefault();
      const result = complete(value, ctx);
      setValue(result.value);
      setHint(result.options.length > 0 ? t.options(result.options.join(', ')) : '');
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const input = value.trim();
      if (input) {
        history.current = [...history.current, input].slice(-50);
        historyIndex.current = history.current.length;
      }
      run(input);
      setValue('');
      setHint('');
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (history.current.length === 0) return;
      event.preventDefault();
      const step = event.key === 'ArrowUp' ? -1 : 1;
      historyIndex.current = Math.min(history.current.length, Math.max(0, historyIndex.current + step));
      setValue(history.current[historyIndex.current] ?? '');
    }
  }

  return (
    <section className="terminal" aria-label={t.label}>
      <div className="terminal__log" role="log" aria-live="polite" hidden={lines.length === 0}>
        {lines.map((line) => (
          <p key={line.id} className={`terminal__line terminal__line--${line.kind}`}>
            {line.text}
          </p>
        ))}
      </div>
      <div className="terminal-input">
        <label className="terminal-input__prompt" htmlFor={inputId}>
          <span aria-hidden="true">&gt;</span>
          <span className="visually-hidden">{t.inputLabel}</span>
        </label>
        <input
          id={inputId}
          value={value}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={t.placeholder}
          aria-describedby={`${inputId}-hint`}
          onChange={(event) => {
            setValue(event.target.value);
            setHint('');
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <p id={`${inputId}-hint`} className="terminal__hint">
        {hint}
      </p>
    </section>
  );
}
