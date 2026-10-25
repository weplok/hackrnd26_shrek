import { useEffect, type ReactNode } from 'react';
import { create } from 'zustand';
import { Panel, Toast } from '@zero-day/ui';
import type { Case, Content, GameState } from '@zero-day/engine';
import { ru } from '../../shared/ui/strings';
import './attack-log.css';

// Each attack method covers a group of weakness archetypes.
export const ATTACKS = [
  { id: 'brute', archetypes: ['brute', 'crypto'] },
  { id: 'virus', archetypes: ['rootkit', 'evasion'] },
  { id: 'ddos', archetypes: ['scan', 'wipe'] },
  { id: 'social', archetypes: ['phish'] },
  { id: 'injection', archetypes: ['exploit'] },
] as const;

export type AttackId = (typeof ATTACKS)[number]['id'];

/** Weakness an attack tries on a node: the node's own one if the attack fits it, else any of the archetype. */
export function attackVuln(
  vulns: readonly { id: string; archetype: string }[],
  attack: AttackId,
  nodeVulns: readonly string[],
): string | undefined {
  const archetypes: readonly string[] = ATTACKS.find((item) => item.id === attack)?.archetypes ?? [];
  const matching = vulns.filter((vuln) => archetypes.includes(vuln.archetype));
  return (matching.find((vuln) => nodeVulns.includes(vuln.id)) ?? matching[0])?.id;
}
type ColumnId = 'scan' | AttackId;
type Outcome = 'ok' | 'fail';
type Results = Record<string, Partial<Record<ColumnId, Outcome>>>;
type Notice = { id: number; ok: boolean; node: string; attack: ColumnId };

const COLUMNS: { id: ColumnId; label: string }[] = [
  { id: 'scan', label: ru.nodeMenu.scan },
  ...ATTACKS.map((attack) => ({ id: attack.id, label: ru.nodeMenu.attacks[attack.id] })),
];

const t = ru.attackLog;
// Lives outside GameState so checkpoint rollbacks and case switches keep it.
const storageKey = 'zero-day.attack-log';

function load(): Results {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey) ?? '{}') as Results;
  } catch {
    return {};
  }
}

type AttackLogStore = {
  results: Results;
  notice: Notice | null;
  dismiss: () => void;
};

export const useAttackLog = create<AttackLogStore>((set) => ({
  results: load(),
  notice: null,
  dismiss: () => {
    set({ notice: null });
  },
}));

const rowKey = (caseId: string, node: string): string => `${caseId}:${node}`;

/** Records the outcome once an attack puzzle closes (solved or out of attempts). */
export function recordAttack(content: Content, before: GameState, after: GameState): void {
  const puzzle = before.activePuzzle;
  if (!puzzle || after.activePuzzle) return;
  const scan = puzzle.action === 'scan';
  const archetype = content.vulnerabilities[puzzle.vuln]?.archetype;
  const attack: ColumnId | undefined = scan
    ? 'scan'
    : ATTACKS.find((item) => (item.archetypes as readonly string[]).includes(archetype ?? ''))?.id;
  if (!attack) return;
  const ok = scan
    ? Boolean(after.nodes[puzzle.nodeId]?.scanned)
    : after.technicalSuccesses > before.technicalSuccesses;
  const key = rowKey(before.caseId, puzzle.nodeId);
  const { results } = useAttackLog.getState();
  const row = results[key] ?? {};
  const next = { ...results, [key]: { ...row, [attack]: ok || row[attack] === 'ok' ? 'ok' : 'fail' } } as Results;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // storage blocked: keep the table in memory only
  }
  const label = content.cases[before.caseId]?.nodes.find((node) => node.id === puzzle.nodeId)?.label ?? puzzle.nodeId;
  useAttackLog.setState({ results: next, notice: { id: Date.now(), ok, node: label, attack } });
}

export function AttackNotice(): ReactNode {
  const notice = useAttackLog((state) => state.notice);
  const dismiss = useAttackLog((state) => state.dismiss);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(dismiss, 3500);
    return () => {
      window.clearTimeout(timer);
    };
  }, [notice, dismiss]);
  if (!notice) return null;
  return (
    <div className="attack-notice">
      <Toast key={notice.id} title={notice.ok ? t.ok : t.fail} variant={notice.ok ? 'success' : 'danger'}>
        {t.notice(t.attackOf[notice.attack], notice.node, notice.ok)}
      </Toast>
    </div>
  );
}

export function AttackTable({ caseData, caseRun }: { caseData: Case; caseRun: GameState }): ReactNode {
  const results = useAttackLog((state) => state.results);
  const rows = caseData.nodes.filter((node) => node.inScope && node.kind !== 'person' && !node.lock);
  const isGateway = (node: Case['nodes'][number]): boolean =>
    node.onCompromise.some((effect) => 'openSegment' in effect && effect.openSegment === node.segment);

  return (
    <Panel className="attack-table" title={t.title}>
      <div className="attack-table__scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{t.node}</th>
              {COLUMNS.map((column) => (
                <th key={column.id} scope="col">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((node) => {
              const row = results[rowKey(caseRun.caseId, node.id)] ?? {};
              const revealed = Boolean(caseRun.nodes[node.id]?.revealed);
              const locked = !revealed || (!caseRun.segmentsOpen[node.segment] && !isGateway(node));
              return (
                <tr key={node.id} className={locked ? 'attack-table__row--locked' : undefined}>
                  <th scope="row">{revealed ? node.label : t.hidden}</th>
                  {COLUMNS.map((column) => {
                    const outcome = row[column.id];
                    return (
                      <td key={column.id} className={outcome ? `attack-table__cell--${outcome}` : undefined}>
                        {outcome === 'ok' ? '✓' : outcome === 'fail' ? '✗' : ''}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
