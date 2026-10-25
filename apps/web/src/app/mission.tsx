import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Panel } from '@zero-day/ui';
import { answerReport, closeChat, noiseSources, openChat, present, profileStyle, wait } from '@zero-day/engine';
import type { Case, Command, Content, GameState } from '@zero-day/engine';
import { useCaseStore } from '../features/game-session';
import { HudBar, ObjectiveTracker, Flipper, hasFlipperJoined, startAchievements } from '../features/hud';
import { AttackNotice, AttackTable } from '../features/attack-log';
import { NetworkMap } from '../features/network-map/NetworkMap';
import { startAutosave, withCaseRun, type SaveRepository } from '../features/persistence';
import { PuzzleHost } from '../features/puzzle-host';
import { socialKey, useSocial } from '../features/social';
import { NodeContextMenu, Terminal } from '../features/terminal';
import { ru } from '../shared/ui/strings';
import { caseOrder } from './pages';

const t = ru.mission;

type EngineFn = (content: Content, state: GameState) => GameState;
type Dispatch = (command: Command) => unknown;

const KIND_GLYPH: Record<string, string> = { machine: '▣', person: '◉', object: '◇', target: '◎', decoy: '◌' };

function unfinishedRun(repository: SaveRepository, caseId: string): GameState | null {
  const live = useCaseStore.getState().caseRun;
  const candidate = live?.caseId === caseId ? live : repository.load().save.caseRun;
  return candidate?.caseId === caseId && candidate.phase !== 'won' ? candidate : null;
}

export function MissionPage({
  content,
  caseId,
  repository,
}: {
  content: Content;
  caseId: string;
  repository: SaveRepository;
}): ReactNode {
  const navigate = useNavigate();
  const caseData = content.cases[caseId];
  const levelIndex = content.campaign.levels.findIndex((level) => level.cases.includes(caseId));
  const level = content.campaign.levels[levelIndex];
  const caseRun = useCaseStore((state) => state.caseRun);
  const start = useCaseStore((state) => state.start);
  const resume = useCaseStore((state) => state.resume);
  const dispatch = useCaseStore((state) => state.dispatch);
  const hasStory = (caseData?.story?.length ?? 0) > 0;
  const [briefing, setBriefing] = useState(() => unfinishedRun(repository, caseId) === null);
  const [storyDone, setStoryDone] = useState(() => !(hasStory && unfinishedRun(repository, caseId) === null));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  function begin(): void {
    if (!level) return;
    useSocial.getState().reset();
    start({ caseId, content, difficulty: level.difficulty });
    setSelectedNodeId(null);
    setStoryDone(!hasStory);
    setBriefing(true);
  }

  useEffect(() => {
    const unfinished = unfinishedRun(repository, caseId);
    if (unfinished) resume(content, unfinished);
    else if (level) {
      useSocial.getState().reset();
      start({ caseId, content, difficulty: level.difficulty });
    }
  }, [caseId, content, level, repository, resume, start]);

  // A lost level resets every social-engineering session.
  useEffect(() => {
    if (caseRun?.phase === 'caught') useSocial.getState().reset();
  }, [caseRun?.phase]);

  useEffect(() => startAutosave(repository, () => useCaseStore.getState().caseRun), [repository]);
  useEffect(() => startAchievements(repository), [repository]);

  // Chat, wait and report steps are engine calls outside the command pipeline, so autosave never sees the win.
  useEffect(() => {
    if (caseRun?.phase === 'won') repository.update((save) => withCaseRun(save, caseRun));
  }, [caseRun, repository]);

  if (!caseData || !level) return null;
  if (!caseRun || caseRun.caseId !== caseId) {
    return <Panel title={ru.appName}>{ru.contentLoading}</Panel>;
  }

  const run = (fn: EngineFn): void => {
    const state = useCaseStore.getState().caseRun;
    if (state) useCaseStore.setState({ caseRun: fn(content, state) });
  };
  const order = caseOrder(content);
  const nextCase = order[order.indexOf(caseId) + 1];
  const goalsDone = caseData.objectives.filter((objective) => caseRun.objectives[objective.id]).length;
  const levelNumber = levelIndex + 1;
  const playing = caseRun.phase === 'playing';

  return (
    <section className="mission" aria-label={ru.campaign}>
      <div className="topbar">
        <span className="topbar__prompt">zero@day:~$</span>
        <strong className="topbar__nick">
          {level.id} · {caseData.title}
        </strong>
        <span className="topbar__muted">{caseData.brief.client}</span>
        <div className="topbar__actions">
          <Link className="zd-button button-link" to="/codex">
            {t.codex}
          </Link>
          <Link className="zd-button button-link" to="/campaign">
            {t.tasks}
          </Link>
        </div>
      </div>

      <HudBar caseTitle={caseData.title} tracks={caseData.tracks} values={caseRun.tracks} />

      <div className="mission__metrics">
        <Metric label={t.ticks} value={String(caseRun.tick)} />
        <Metric label={t.scans} value={String(caseRun.scans)} />
        <Metric label={t.goals} value={`${String(goalsDone)}/${String(caseData.objectives.length)}`} />
        <div className="mission__buttons">
          <Button
            type="button"
            disabled={!playing}
            onClick={() => {
              run(wait);
            }}
          >
            {t.wait}
          </Button>
          <Button type="button" onClick={begin}>
            {t.restart}
          </Button>
        </div>
      </div>

      <div className="mission__top">
        <div className="mission__map">
          <NetworkMap
            caseData={caseData}
            gameState={caseRun}
            onSelectNode={setSelectedNodeId}
            selectedNodeId={selectedNodeId}
          />
          {levelIndex === 0 && <AttackTable caseData={caseData} caseRun={caseRun} />}
        </div>
        <div className="mission__side">
          <NodeInspector
            key={selectedNodeId ?? ''}
            content={content}
            caseData={caseData}
            caseRun={caseRun}
            nodeId={selectedNodeId}
            terminalOnly={levelIndex >= 2}
            dispatch={dispatch}
            run={run}
            onClose={() => {
              setSelectedNodeId(null);
            }}
          />
          <ObjectiveTracker completed={caseRun.objectives} objectives={caseData.objectives} />
          {hasFlipperJoined(caseRun.flags, levelNumber) && (
            <Flipper caseId={caseId} level={levelNumber} lines={content.flipper.lines} tracks={caseRun.tracks} />
          )}
        </div>
      </div>

      <div className="mission__bottom">
        <EvidenceBoard caseData={caseData} caseRun={caseRun} dispatch={dispatch} />
        <Journal caseRun={caseRun} />
      </div>
      <div className="mission__terminal">
        <Terminal vulns={Object.values(content.vulnerabilities)} caseData={caseData} />
      </div>

      <PuzzleHost />
      <AttackNotice />
      {briefing && hasStory && !storyDone && (
        <StoryOverlay
          title={caseData.title}
          slides={caseData.story ?? []}
          onContinue={() => {
            setStoryDone(true);
          }}
          onExit={() => {
            navigate('/campaign');
          }}
        />
      )}
      {briefing && (storyDone || !hasStory) && (
        <BriefOverlay
          caseData={caseData}
          caseId={caseId}
          onStart={() => {
            setBriefing(false);
          }}
          onExit={() => {
            navigate('/campaign');
          }}
        />
      )}
      <SocialOverlay content={content} caseData={caseData} caseRun={caseRun} />
      {caseRun.activeChat && <ChatOverlay content={content} caseData={caseData} caseRun={caseRun} run={run} />}
      {caseRun.pendingScope && (
        <ScopeOverlay content={content} caseData={caseData} nodeId={caseRun.pendingScope} dispatch={dispatch} />
      )}
      {caseRun.phase === 'report' && <ReportOverlay caseData={caseData} caseRun={caseRun} run={run} />}
      {caseRun.phase === 'won' && (
        <WonOverlay
          caseData={caseData}
          caseRun={caseRun}
          onNext={
            nextCase
              ? () => {
                  navigate(`/play/${nextCase}`);
                }
              : undefined
          }
        />
      )}
      {caseRun.phase === 'caught' && (
        <CaughtOverlay
          caseRun={caseRun}
          onRollback={() => {
            dispatch({ type: 'RestoreCheckpoint' });
          }}
        />
      )}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'muted' }): ReactNode {
  return (
    <div className={`mission-metric${tone ? ` mission-metric--${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function NodeInspector({
  content,
  caseData,
  caseRun,
  nodeId,
  terminalOnly,
  dispatch,
  run,
  onClose,
}: {
  content: Content;
  caseData: Case;
  caseRun: GameState;
  nodeId: string | null;
  /** From level 3 on, attacks are typed in the terminal. */
  terminalOnly: boolean;
  dispatch: Dispatch;
  run: (fn: EngineFn) => void;
  onClose: () => void;
}): ReactNode {
  const node = nodeId ? caseData.nodes.find((item) => item.id === nodeId) : undefined;
  const runtime = node ? caseRun.nodes[node.id] : undefined;

  if (!node || !runtime) {
    return (
      <Panel className="inspector" title={ru.nodeMenu.title}>
        <p className="copy">{t.nodeEmpty}</p>
      </Panel>
    );
  }

  const playing = caseRun.phase === 'playing';
  const npc = node.npc;

  return (
    <Panel className="inspector" title={t.nodeTitle(node.id)}>
      <div className="inspector__head">
        <span className="inspector__glyph" aria-hidden="true">
          {KIND_GLYPH[node.kind] ?? '▣'}
        </span>
        <div>
          <strong>{node.label}</strong>
          <p className="fine-print">{ru.networkMap.kind[node.kind]}</p>
        </div>
      </div>
      {!node.inScope && <p className="inspector__warning">{t.nodeOutOfScope}</p>}
      {runtime.compromised ? (
        <p className="inspector__ok">{t.nodeOwned}</p>
      ) : node.lock ? (
        <div className="inspector__lock">
          <p className="form-label">{t.lock}</p>
          {node.lock.sockets.map((socket) => {
            const filled = Boolean(caseRun.sockets[node.id]?.[socket.id]);
            const key = socket.accepts.replace(/^key:/, '');
            return (
              <Button
                key={socket.id}
                type="button"
                disabled={filled || !playing}
                onClick={() => dispatch({ type: 'FillSocket', node: node.id, socket: socket.id, key })}
              >
                {filled ? t.socketDone(socket.label) : t.socketFill(socket.label)}
                {!filled && !caseRun.keys[key] ? ` (${t.socketNoKey})` : ''}
              </Button>
            );
          })}
        </div>
      ) : npc ? (
        <Button
          type="button"
          variant="primary"
          disabled={!playing}
          onClick={() => {
            run((c, s) => openChat(c, s, npc));
          }}
        >
          {t.talk}
        </Button>
      ) : node.kind === 'person' ? (
        <NodeContextMenu
          node={node.id}
          label={node.label}
          vulns={[]}
          person
          terminalOnly={terminalOnly}
          onScan={() => undefined}
          onHypothesis={() => undefined}
          onSocial={(id) => void useSocial.getState().open(caseRun.caseId, id)}
          onClose={onClose}
        />
      ) : (
        <NodeContextMenu
          node={node.id}
          label={node.label}
          vulns={Object.values(content.vulnerabilities)}
          nodeVulns={node.exploits?.map((exploit) => exploit.vuln)}
          terminalOnly={terminalOnly}
          onScan={(id) => dispatch({ type: 'ScanNode', node: id })}
          onHypothesis={(id, vuln) => dispatch({ type: 'ProposeHypothesis', node: id, vuln })}
          onClose={onClose}
        />
      )}
    </Panel>
  );
}

function tokenLabel(caseData: Case, id: string): string {
  return (
    caseData.clues.find((clue) => clue.id === id)?.text ??
    caseData.keyRecipes.find((recipe) => recipe.output === id)?.label ??
    id
  );
}

function ownedTokens(caseRun: GameState): { clues: string[]; keys: string[] } {
  return {
    clues: Object.keys(caseRun.clues).filter((id) => caseRun.clues[id]),
    keys: Object.keys(caseRun.keys).filter((id) => caseRun.keys[id]),
  };
}

function EvidenceBoard({
  caseData,
  caseRun,
  dispatch,
}: {
  caseData: Case;
  caseRun: GameState;
  dispatch: Dispatch;
}): ReactNode {
  const [picked, setPicked] = useState<string[]>([]);
  const { clues, keys } = ownedTokens(caseRun);
  const [a, b] = picked;

  function toggle(id: string): void {
    setPicked((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id].slice(-2)));
  }

  return (
    <Panel className="board" title={t.board}>
      {clues.length === 0 && keys.length === 0 ? (
        <p className="copy">{t.boardEmpty}</p>
      ) : (
        <>
          <p className="fine-print">{t.boardHint}</p>
          <div className="chips">
            {[...clues, ...keys].map((id) => (
              <button
                key={id}
                type="button"
                className={`chip${keys.includes(id) ? ' chip--key' : ''}`}
                aria-pressed={picked.includes(id)}
                onClick={() => {
                  toggle(id);
                }}
              >
                {keys.includes(id) ? '🔑 ' : ''}
                {tokenLabel(caseData, id)}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="primary"
            disabled={!a || !b || caseRun.phase !== 'playing'}
            onClick={() => {
              if (a && b) dispatch({ type: 'CombineClues', a, b });
              setPicked([]);
            }}
          >
            {t.combine}
          </Button>
        </>
      )}
    </Panel>
  );
}

function Journal({ caseRun }: { caseRun: GameState }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [caseRun.log.length]);

  return (
    <Panel className="journal" title={t.log}>
      <div className="journal__log" ref={ref} role="log">
        {caseRun.log.slice(-80).map((line, index) => (
          <div key={index} className={`journal__line journal__line--${line.kind}`}>
            {line.t}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Overlay({ title, tone, children }: { title: string; tone?: 'danger' | 'ok'; children: ReactNode }): ReactNode {
  const id = useId();
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby={id}>
      <Panel className={`overlay__panel${tone ? ` overlay__panel--${tone}` : ''}`}>
        <h2 id={id} className="overlay__title">
          {title}
        </h2>
        {children}
      </Panel>
    </div>
  );
}

function StoryOverlay({
  title,
  slides,
  onContinue,
  onExit,
}: {
  title: string;
  slides: string[];
  onContinue: () => void;
  onExit: () => void;
}): ReactNode {
  const [shown, setShown] = useState(1);
  const atEnd = shown >= slides.length;
  return (
    <Overlay title={title}>
      <p className="overlay__tag">{t.storyTag}</p>
      <div className="intro-brief__lines" aria-live="polite">
        {slides.slice(0, shown).map((line) => (
          <p key={line} className="intro-brief__line intro-brief__line--main">
            {line}
          </p>
        ))}
      </div>
      <div className="form-actions">
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            if (atEnd) onContinue();
            else setShown((count) => count + 1);
          }}
        >
          {atEnd ? t.storyToBrief : t.storyNext}
        </Button>
        {!atEnd && (
          <Button
            type="button"
            onClick={() => {
              setShown(slides.length);
            }}
          >
            {t.storySkip}
          </Button>
        )}
        <Button type="button" onClick={onExit}>
          {ru.back}
        </Button>
      </div>
    </Overlay>
  );
}

function BriefOverlay({
  caseData,
  caseId,
  onStart,
  onExit,
}: {
  caseData: Case;
  caseId: string;
  onStart: () => void;
  onExit: () => void;
}): ReactNode {
  return (
    <Overlay title={caseData.title}>
      <p className="overlay__tag">{t.brief(caseId)}</p>
      <p className="contract__client">{t.client(caseData.brief.client)}</p>
      <p className="copy">{caseData.brief.text}</p>
      <div className="overlay__box">
        <strong>{t.scope}:</strong> {caseData.scope.text}
        {caseData.scope.rules && (
          <ul>
            {caseData.scope.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="form-actions">
        <Button type="button" variant="primary" onClick={onStart}>
          {t.sign}
        </Button>
        <Button type="button" onClick={onExit}>
          {ru.back}
        </Button>
      </div>
    </Overlay>
  );
}

function ChatOverlay({
  content,
  caseData,
  caseRun,
  run,
}: {
  content: Content;
  caseData: Case;
  caseRun: GameState;
  run: (fn: EngineFn) => void;
}): ReactNode {
  const npcId = caseRun.activeChat ?? '';
  const config = content.npcs[npcId];
  const runtime = caseRun.npc[npcId];
  const [attached, setAttached] = useState<string[]>([]);
  if (!config || !runtime) return null;

  const prefix = `[чат ${config.role}] `;
  const history = caseRun.log.filter((line) => line.t.startsWith(prefix)).map((line) => line.t.slice(prefix.length));
  const { clues, keys } = ownedTokens(caseRun);
  const closed = runtime.locked || runtime.yielded || caseRun.phase !== 'playing';

  return (
    <Overlay title={t.chat(config.role)}>
      <div className="chat__history">
        {[config.replies.greeting ?? '…', ...history].map((reply, index) => (
          <p key={index} className="chat__bubble">
            {reply}
          </p>
        ))}
      </div>
      <p className="fine-print">
        {t.suspicion(runtime.suspicion, config.suspicion.fail_at)}
        {runtime.locked ? ` · ${t.npcLocked}` : runtime.yielded ? ` · ${t.npcYielded}` : ''}
      </p>
      {!closed && clues.length + keys.length > 0 && (
        <>
          <p className="form-label">{t.attach}</p>
          <div className="chips">
            {[...clues, ...keys].map((id) => (
              <button
                key={id}
                type="button"
                className="chip"
                aria-pressed={attached.includes(id)}
                onClick={() => {
                  setAttached((list) =>
                    list.includes(id) ? list.filter((item) => item !== id) : [...list, id].slice(-2),
                  );
                }}
              >
                {tokenLabel(caseData, id)}
              </button>
            ))}
          </div>
        </>
      )}
      {!closed && (
        <>
          <p className="form-label">{t.tone}</p>
          <div className="chips">
            {config.tones.map((tone) => (
              <Button
                key={tone}
                type="button"
                onClick={() => {
                  run((c, s) => present(c, s, npcId, tone, attached));
                  setAttached([]);
                }}
              >
                {t.tones[tone] ?? tone}
              </Button>
            ))}
          </div>
        </>
      )}
      <div className="form-actions">
        <Button
          type="button"
          onClick={() => {
            run(closeChat);
          }}
        >
          {t.close}
        </Button>
      </div>
    </Overlay>
  );
}

function SocialOverlay({
  content,
  caseData,
  caseRun,
}: {
  content: Content;
  caseData: Case;
  caseRun: GameState;
}): ReactNode {
  const openKey = useSocial((state) => state.openKey);
  const chat = useSocial((state) => (openKey ? state.chats[openKey] : undefined));
  const [draft, setDraft] = useState('');
  const historyRef = useRef<HTMLDivElement | null>(null);
  const messageCount = chat?.messages.length ?? 0;
  useEffect(() => {
    if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight;
  }, [messageCount, chat?.pending]);

  const node = caseData.nodes.find((item) => openKey === socialKey(caseRun.caseId, item.id));
  if (!openKey || !node) return null;
  const st = ru.social;
  const nodeId = node.id;
  const closed = !chat?.npcId || chat.verdict !== 'continue' || caseRun.phase !== 'playing';

  function submit(): void {
    if (!draft.trim()) return;
    void useSocial.getState().send(content, caseRun.caseId, nodeId, draft);
    setDraft('');
  }

  return (
    <Overlay title={st.title(node.label)} {...(chat?.verdict === 'noticed' ? { tone: 'danger' as const } : {})}>
      <p className="fine-print">{st.trust(chat?.trust ?? null)}</p>
      <div className="chat__history" ref={historyRef} role="log">
        {!chat && <p className="fine-print">{st.connecting}</p>}
        {chat && chat.messages.length === 0 && <p className="fine-print">{st.empty}</p>}
        {chat?.messages.map((message, index) => (
          <p key={index} className={`chat__bubble chat__bubble--${message.from}`}>
            {message.text}
          </p>
        ))}
        {chat?.pending && <p className="fine-print">{st.typing}</p>}
      </div>
      {chat && chat.verdict !== 'continue' && (
        <p className={chat.verdict === 'complete' ? 'inspector__ok' : 'inspector__warning'}>
          {st.verdict[chat.verdict]}
        </p>
      )}
      {!closed && (
        <form
          className="chat__form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <textarea
            className="chat__input"
            aria-label={st.placeholder}
            placeholder={st.placeholder}
            value={draft}
            rows={2}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <Button type="submit" variant="primary" disabled={!draft.trim() || chat?.pending}>
            {st.send}
          </Button>
        </form>
      )}
      <div className="form-actions">
        <Button
          type="button"
          onClick={() => {
            useSocial.getState().close();
          }}
        >
          {t.close}
        </Button>
      </div>
    </Overlay>
  );
}

function ScopeOverlay({
  content,
  caseData,
  nodeId,
  dispatch,
}: {
  content: Content;
  caseData: Case;
  nodeId: string;
  dispatch: Dispatch;
}): ReactNode {
  const node = caseData.nodes.find((item) => item.id === nodeId);
  const consequence = caseData.scope.consequence ? content.consequences[caseData.scope.consequence] : undefined;

  return (
    <Overlay title={t.scopeTitle(node?.label ?? nodeId)} tone="danger">
      <p className="overlay__tag overlay__tag--danger">{t.scopeTag}</p>
      {consequence && (
        <div className="overlay__box">
          <strong>{consequence.title}</strong>
          <ul>
            {consequence.facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="form-actions">
        <Button type="button" variant="primary" onClick={() => dispatch({ type: 'DeclineOutOfScope' })}>
          {t.scopeBack}
        </Button>
        <Button type="button" onClick={() => dispatch({ type: 'ConfirmOutOfScope', node: nodeId })}>
          {t.scopeGo}
        </Button>
      </div>
    </Overlay>
  );
}

function ReportOverlay({
  caseData,
  caseRun,
  run,
}: {
  caseData: Case;
  caseRun: GameState;
  run: (fn: EngineFn) => void;
}): ReactNode {
  return (
    <Overlay title={t.report} tone="ok">
      <p className="copy">{t.reportCopy}</p>
      {caseData.report.findings.map((finding) => {
        const answered = finding.id in caseRun.report;
        const correct = caseRun.report[finding.id];
        return (
          <div key={finding.id} className="overlay__box">
            <p className="overlay__tag">{finding.vuln}</p>
            <p className="copy">{finding.explanation}</p>
            <div className="report__options">
              {finding.options.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  disabled={answered && correct}
                  onClick={() => {
                    run((c, s) => answerReport(c, s, finding.id, option.id));
                  }}
                >
                  {option.text}
                </Button>
              ))}
            </div>
            {answered && (
              <p className={correct ? 'inspector__ok' : 'inspector__warning'}>{correct ? t.reportOk : t.reportBad}</p>
            )}
          </div>
        );
      })}
    </Overlay>
  );
}

function WonOverlay({
  caseData,
  caseRun,
  onNext,
}: {
  caseData: Case;
  caseRun: GameState;
  onNext: (() => void) | undefined;
}): ReactNode {
  return (
    <Overlay title={t.won} tone="ok">
      <p className="overlay__tag">{caseData.title}</p>
      <p className="copy">{t.wonCopy(caseRun.tick, Math.round(caseRun.maxAlarm))}</p>
      <p className="result__rank">
        {t.rank}: <strong>{caseRun.rank}</strong> · {t.style.toLowerCase()}: <strong>{profileStyle(caseRun)}</strong>
      </p>
      <div className="form-actions">
        {onNext ? (
          <Button type="button" variant="primary" onClick={onNext}>
            {t.next}
          </Button>
        ) : (
          <Link className="zd-button zd-button--primary button-link" to="/campaign">
            {t.allDone}
          </Link>
        )}
        <Link className="zd-button button-link" to="/codex">
          {t.codex}
        </Link>
        <Link className="zd-button button-link" to="/campaign">
          {t.toContracts}
        </Link>
      </div>
    </Overlay>
  );
}

function CaughtOverlay({ caseRun, onRollback }: { caseRun: GameState; onRollback: () => void }): ReactNode {
  const sources = noiseSources(caseRun).slice(0, 3);
  return (
    <Overlay title={t.caught} tone="danger">
      <p className="copy">{t.caughtCopy}</p>
      <ul className="result__noise">
        {sources.map((item) => (
          <li key={item.source}>
            {item.source}: +{item.noise}
          </li>
        ))}
      </ul>
      <div className="form-actions">
        <Button type="button" variant="primary" onClick={onRollback}>
          {t.rollback}
        </Button>
        <Link className="zd-button button-link" to="/campaign">
          {t.toContracts}
        </Link>
      </div>
    </Overlay>
  );
}
