import { useEffect, type ReactNode } from 'react';
import { Button } from '@zero-day/ui';
import type { Case } from '@zero-day/engine';
import { ru } from '../../shared/ui/strings';
import './briefing.css';

export type BriefingModalProps = {
  caseData: Case;
  onClose: () => void;
};

export function BriefingModal({ caseData, onClose }: BriefingModalProps): ReactNode {
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const titleId = 'briefing-title';
  const rules = caseData.scope?.rules ?? [];

  return (
    <div
      className="briefing-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div aria-labelledby={titleId} aria-modal="true" className="briefing-card" role="dialog">
        <div className="briefing-card__head">
          <CatAvatar />
          <div>
            <span className="briefing-card__lead">{ru.briefing.lead}</span>
            <h2 className="briefing-card__title" id={titleId}>
              {ru.briefTitle(caseData.brief.client)}
            </h2>
          </div>
        </div>
        <p className="briefing-card__text">{caseData.brief.text}</p>
        {caseData.scope?.text ? (
          <div className="briefing-card__scope">
            <span className="briefing-card__scope-title">{ru.briefing.scopeTitle}</span>
            <p>{caseData.scope.text}</p>
            {rules.length > 0 ? (
              <ul>
                {rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className="briefing-card__actions">
          <Button autoFocus type="button" variant="primary" onClick={onClose}>
            {ru.briefing.start}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CatAvatar(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className="briefing-card__avatar"
      fill="none"
      height="72"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 48 48"
      width="72"
    >
      <path d="M12 14 9 5l8 4M36 14l3-9-8 4" />
      <path d="M10 25a14 11 0 0 1 28 0c0 8-6 14-14 14S10 33 10 25Z" />
      <path d="M18 24h.01M30 24h.01" />
      <path d="M24 28v2M24 30l-3 2M24 30l3 2" />
      <path d="M8 27 2 25M8 30l-6 2M40 27l6-2M40 30l6 2" />
    </svg>
  );
}
