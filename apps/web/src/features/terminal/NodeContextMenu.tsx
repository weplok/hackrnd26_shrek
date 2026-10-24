import { useState, type ReactNode } from 'react';
import type { Vulnerability } from '@zero-day/engine';
import { ATTACKS, attackVuln, type AttackId } from '../attack-log';
import { ATTACK_COMMANDS } from './parser';
import { ru } from '../../shared/ui/strings';

const t = ru.nodeMenu;

export interface NodeContextMenuProps {
  node: string;
  label: string;
  /** Open weakness catalog for the current case. */
  vulns: readonly Vulnerability[];
  /** Weakness ids the node is actually exposed to. */
  nodeVulns?: readonly string[];
  /** People expose social engineering and nothing else. */
  person?: boolean;
  /** Buttons only teach the terminal command instead of running the action. */
  terminalOnly?: boolean;
  onScan: (node: string) => void;
  onHypothesis: (node: string, vuln: string) => void;
  onSocial?: (node: string) => void;
  onClose: () => void;
}

// Keyboard-free path for the terminal hypothesis (FR-032).
export function NodeContextMenu({
  node,
  label,
  vulns,
  nodeVulns = [],
  person = false,
  terminalOnly = false,
  onScan,
  onHypothesis,
  onSocial,
  onClose,
}: NodeContextMenuProps): ReactNode {
  const [hint, setHint] = useState('');
  const teach = (command: string): boolean => {
    if (terminalOnly) setHint(t.terminalHint(`${command} ${node}`));
    return terminalOnly;
  };
  const commandOf = (attack: AttackId): string => ATTACK_COMMANDS[attack];

  return (
    <div className="node-menu" role="group" aria-label={t.label(label)}>
      <p className="node-menu__title">{label}</p>
      <ul className="node-menu__list">
        {person ? (
          <li>
            <button
              type="button"
              className="node-menu__item"
              onClick={() => {
                if (!teach(commandOf('social'))) onSocial?.(node);
              }}
            >
              {t.attacks.social}
            </button>
          </li>
        ) : (
          <>
            <li>
              <button
                type="button"
                className="node-menu__item"
                onClick={() => {
                  if (!teach('scan')) onScan(node);
                }}
              >
                {t.scan}
              </button>
            </li>
            {ATTACKS.filter((attack) => attack.id !== 'social').map((attack) => {
              const vuln = attackVuln(vulns, attack.id, nodeVulns);
              return (
                <li key={attack.id}>
                  <button
                    type="button"
                    className="node-menu__item"
                    disabled={!vuln}
                    onClick={() => {
                      if (vuln && !teach(commandOf(attack.id))) onHypothesis(node, vuln);
                    }}
                  >
                    {t.attacks[attack.id]}
                  </button>
                </li>
              );
            })}
          </>
        )}
        <li>
          <button type="button" className="node-menu__item" onClick={onClose}>
            {t.close}
          </button>
        </li>
      </ul>
      {hint && (
        <p className="node-menu__hint" role="status">
          {hint}
        </p>
      )}
    </div>
  );
}
