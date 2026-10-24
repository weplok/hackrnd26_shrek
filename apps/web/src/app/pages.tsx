import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Panel } from '@zero-day/ui';
import type { Content } from '@zero-day/engine';
import type { SaveData } from '../features/persistence';
import { ru } from '../shared/ui/strings';

export const DEMO_CASE = 'L2C1';
const DIFF_STARS = ['★☆☆', '★★☆', '★★★'];

export function caseOrder(content: Content): string[] {
  return content.campaign.levels.flatMap((level) => level.cases).filter((id) => id in content.cases);
}

// FR-004: the demo case stays playable by link even while its card is locked.
export function caseUnlocked(content: Content, save: SaveData, caseId: string, allowDemo = false): boolean {
  const order = caseOrder(content);
  const index = order.indexOf(caseId);
  if (index < 0) return false;
  const previous = order[index - 1];
  return (
    index === 0 ||
    (allowDemo && caseId === DEMO_CASE) ||
    (previous !== undefined && save.completedCases.includes(previous))
  );
}

export function IntroPage(): ReactNode {
  const navigate = useNavigate();
  const lines = ru.intro.lines;
  const [shown, setShown] = useState(0);
  const finished = shown >= lines.length;

  useEffect(() => {
    if (finished) return;
    const id = window.setTimeout(
      () => {
        setShown((count) => count + 1);
      },
      shown === 0 ? 250 : 600,
    );
    return () => {
      window.clearTimeout(id);
    };
  }, [finished, shown]);

  return (
    <Panel className="intro-brief" title={ru.intro.title}>
      <div className="intro-brief__lines" aria-live="polite">
        {lines.slice(0, shown).map((line) => (
          <p key={line.text} className={`intro-brief__line intro-brief__line--${line.tone}`}>
            {line.text}
          </p>
        ))}
        {!finished && (
          <span className="terminal-input__cursor" aria-hidden="true">
            ▍
          </span>
        )}
      </div>
      <div className="form-actions">
        <Button
          type="button"
          variant="primary"
          disabled={!finished}
          onClick={() => {
            navigate('/campaign');
          }}
        >
          {ru.intro.next}
        </Button>
        {!finished && (
          <Button
            type="button"
            onClick={() => {
              setShown(lines.length);
            }}
          >
            {ru.intro.skip}
          </Button>
        )}
      </div>
    </Panel>
  );
}

export function ContractsPage({
  content,
  save,
  nickname,
}: {
  content: Content;
  save: SaveData;
  nickname: string | null;
}): ReactNode {
  const navigate = useNavigate();
  const order = caseOrder(content);
  const codexTotal = Object.keys(content.codex).length;
  const t = ru.contracts;

  return (
    <section className="contracts" aria-label={ru.campaign}>
      <div className="topbar">
        <span className="topbar__prompt">zero@day:~$</span>
        <strong className="topbar__nick">{nickname ?? ru.localMode}</strong>
        <div className="topbar__actions">
          <Button
            type="button"
            onClick={() => {
              navigate(`/play/${DEMO_CASE}`);
            }}
          >
            {t.demo}
          </Button>
          <Link className="zd-button button-link" to="/codex">
            {t.codex(save.codex.length, codexTotal)}
          </Link>
          <Link className="zd-button button-link" to="/">
            {t.menu}
          </Link>
        </div>
      </div>
      <h1 className="contracts__title">{t.title}</h1>
      <p className="copy">{t.copy}</p>
      <div className="contracts__grid">
        {order.map((caseId, index) => {
          const caseData = content.cases[caseId];
          const levelIndex = content.campaign.levels.findIndex((level) => level.cases.includes(caseId));
          const level = content.campaign.levels[levelIndex];
          if (!caseData || !level) return null;
          const unlocked = caseUnlocked(content, save, caseId);
          const done = save.completedCases.includes(caseId);
          const inProgress = save.caseRun?.caseId === caseId && save.caseRun.phase !== 'won';
          const previous = order[index - 1];
          const target = caseData.objectives[caseData.objectives.length - 1];

          return (
            <Panel
              key={caseId}
              className={`contract${done ? ' contract--done' : ''}${unlocked ? '' : ' contract--locked'}`}
              title={`${level.id} · ${level.title} · ${caseId}`}
              style={{ '--accent': level.accent } as CSSProperties}
            >
              <div className="contract__head">
                <h2>{caseData.title}</h2>
                <span className="contract__stars" aria-label={`сложность ${String(levelIndex + 1)}`}>
                  {DIFF_STARS[levelIndex] ?? '★★★'}
                </span>
              </div>
              <p className="contract__client">{ru.mission.client(caseData.brief.client)}</p>
              <p className="copy">{caseData.brief.text}</p>
              {target && (
                <p className="contract__goal">
                  <span aria-hidden="true">◉</span> {t.goal}: {target.title}
                </p>
              )}
              {done && <p className="contract__done">{t.done}</p>}
              {unlocked ? (
                <Button
                  type="button"
                  variant={done ? 'secondary' : 'primary'}
                  onClick={() => {
                    navigate(`/play/${caseId}`);
                  }}
                >
                  {inProgress ? t.resume : done ? t.replay : t.play}
                </Button>
              ) : (
                <p className="contract__lock">
                  🔒 {t.locked(previous ? (content.cases[previous]?.title ?? previous) : '')}
                </p>
              )}
            </Panel>
          );
        })}
      </div>
    </section>
  );
}

export function CodexPage({ content, opened }: { content: Content; opened: readonly string[] }): ReactNode {
  const ids = Object.keys(content.codex).sort();
  const [selected, setSelected] = useState(ids.find((id) => opened.includes(id)) ?? ids[0] ?? '');
  const card = content.codex[selected];
  const known = opened.includes(selected);
  const t = ru.codexPage;

  return (
    <Panel className="codex" title={t.title}>
      <p className="copy">{t.copy}</p>
      <div className="codex__body">
        <nav className="codex__list" aria-label={t.list}>
          {ids.map((id) => (
            <button
              key={id}
              type="button"
              className={`codex__item${id === selected ? ' codex__item--active' : ''}`}
              aria-current={id === selected}
              onClick={() => {
                setSelected(id);
              }}
            >
              {id} {opened.includes(id) ? '' : '🔒'}
            </button>
          ))}
        </nav>
        <article className="codex__card">
          {card && known ? (
            <>
              <p className="codex__id">{card.id}</p>
              <h2>{card.realTerm}</h2>
              <h3>{t.why}</h3>
              <p className="copy">{card.whyItWorks}</p>
              <h3>{t.defense}</h3>
              <p className="copy">{card.defense}</p>
              <h3>{t.realCase}</h3>
              <p className="copy">{card.realCase}</p>
              <h3>{t.law}</h3>
              <p className="copy">{card.law}</p>
              <h3>{t.more}</h3>
              <ul>
                {card.learnMore.map((link) => (
                  <li key={link.url}>
                    <a href={link.url} target="_blank" rel="noreferrer">
                      {link.title}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="copy">{t.locked}</p>
          )}
        </article>
      </div>
      <Link className="zd-button zd-button--primary button-link" to="/campaign">
        {ru.mission.toContracts}
      </Link>
    </Panel>
  );
}
