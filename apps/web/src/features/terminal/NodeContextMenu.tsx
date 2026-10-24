import type { ReactNode } from 'react';
import type { Vulnerability } from '@zero-day/engine';
import { ru } from '../../shared/ui/strings';

const t = ru.nodeMenu;

// Each attack method covers a group of weakness archetypes.
const ATTACKS = [
  { id: 'brute', archetypes: ['brute', 'crypto'] },
  { id: 'virus', archetypes: ['rootkit', 'evasion'] },
  { id: 'ddos', archetypes: ['scan', 'wipe'] },
  { id: 'social', archetypes: ['phish'] },
  { id: 'injection', archetypes: ['exploit'] },
] as const;

export interface NodeContextMenuProps {
  node: string;
  label: string;
  /** Open weakness catalog for the current case. */
  vulns: readonly Vulnerability[];
  /** Weakness ids the node is actually exposed to. */
  nodeVulns?: readonly string[];
  onScan: (node: string) => void;
  onHypothesis: (node: string, vuln: string) => void;
  onClose: () => void;
}

// Keyboard-free path for the terminal hypothesis (FR-032).
export function NodeContextMenu({
  node,
  label,
  vulns,
  nodeVulns = [],
  onScan,
  onHypothesis,
  onClose,
}: NodeContextMenuProps): ReactNode {
  const pick = (archetypes: readonly string[]): string | undefined => {
    const matching = vulns.filter((vuln) => archetypes.includes(vuln.archetype));
    return (matching.find((vuln) => nodeVulns.includes(vuln.id)) ?? matching[0])?.id;
  };

  return (
    <div className="node-menu" role="group" aria-label={t.label(label)}>
      <p className="node-menu__title">{label}</p>
      <ul className="node-menu__list">
        <li>
          <button
            type="button"
            className="node-menu__item"
            onClick={() => {
              onScan(node);
            }}
          >
            {t.scan}
          </button>
        </li>
        {ATTACKS.map((attack) => {
          const vuln = pick(attack.archetypes);
          return (
            <li key={attack.id}>
              <button
                type="button"
                className="node-menu__item"
                disabled={!vuln}
                onClick={() => {
                  if (vuln) onHypothesis(node, vuln);
                }}
              >
                {t.attacks[attack.id]}
              </button>
            </li>
          );
        })}
        <li>
          <button type="button" className="node-menu__item" onClick={onClose}>
            {t.close}
          </button>
        </li>
      </ul>
    </div>
  );
}
