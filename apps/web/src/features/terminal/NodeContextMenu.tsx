import { useState, type ReactNode } from 'react';
import type { Vulnerability } from '@zero-day/engine';
import { ru } from '../../shared/ui/strings';

const t = ru.nodeMenu;

export interface NodeContextMenuProps {
  node: string;
  label: string;
  /** Open weakness catalog for the current case. */
  vulns: readonly Vulnerability[];
  onScan: (node: string) => void;
  onHypothesis: (node: string, vuln: string) => void;
  onClose: () => void;
}

// Keyboard-free path for the terminal hypothesis (FR-032).
export function NodeContextMenu({
  node,
  label,
  vulns,
  onScan,
  onHypothesis,
  onClose,
}: NodeContextMenuProps): ReactNode {
  const [picking, setPicking] = useState(false);

  return (
    <div className="node-menu" role="group" aria-label={t.label(label)}>
      <p className="node-menu__title">{label}</p>
      {picking ? (
        <ul className="node-menu__list">
          {vulns.map((vuln) => (
            <li key={vuln.id}>
              <button
                type="button"
                className="node-menu__item"
                onClick={() => {
                  onHypothesis(node, vuln.id);
                }}
              >
                <span className="node-menu__id">{vuln.id.replace('SL', 'СЛ')}</span> {vuln.title}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="node-menu__item"
              onClick={() => {
                setPicking(false);
              }}
            >
              {t.back}
            </button>
          </li>
        </ul>
      ) : (
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
          <li>
            <button
              type="button"
              className="node-menu__item"
              onClick={() => {
                setPicking(true);
              }}
            >
              {t.exploit}
            </button>
          </li>
          <li>
            <button type="button" className="node-menu__item" onClick={onClose}>
              {t.close}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
