import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Button, Panel } from '@zero-day/ui';
import type { Campaign, Case, Content, GameState } from '@zero-day/engine';
import { ErrorBoundary } from './ErrorBoundary';
import { content } from '../content';
import { BriefingModal } from '../features/briefing';
import { useCaseStore } from '../features/game-session';
import { GameHud } from '../features/hud';
import { NetworkMap } from '../features/network-map/NetworkMap';
import { SaveRepository, startAutosave } from '../features/persistence';
import { PuzzleHost, ToolLab } from '../features/puzzle-host';
import { NodeContextMenu, Terminal } from '../features/terminal';
import { loadContentSummary, type ContentSummary } from '../shared/content/loadContent';
import { readNickname, saveNickname } from '../shared/profile/storage';
import { validateNickname, type NicknameError } from '../shared/profile/nickname';
import { createAnonymousSession, type SessionState } from '../shared/session/createSession';
import { ru } from '../shared/ui/strings';
import { TelemetryClient } from '../telemetry';

type CampaignStart = {
  caseData: Case;
  caseId: string;
  level: Campaign['levels'][number];
};

function getCampaignStart(gameContent: Content): CampaignStart {
  const level = gameContent.campaign.levels[0];
  const caseId = level?.cases[0];
  const caseData = caseId ? gameContent.cases[caseId] : undefined;

  if (!level || !caseId || !caseData) {
    throw new Error('Campaign has no playable case.');
  }

  return { caseData, caseId, level };
}

const gameContent = content;
const campaignStart = getCampaignStart(gameContent);
const saveRepository = new SaveRepository(gameContent.campaign.contentVersion);

type ContentState = { status: 'loading' } | { status: 'ready'; summary: ContentSummary } | { status: 'offline' };

type BootstrapState = {
  content: ContentState;
  session: SessionState;
};

const initialBootstrapState: BootstrapState = {
  content: { status: 'loading' },
  session: { id: '', status: 'offline' },
};

export function App(): ReactNode {
  const [bootstrap, setBootstrap] = useState<BootstrapState>(initialBootstrapState);
  const [telemetry, setTelemetry] = useState<TelemetryClient | null>(null);

  useEffect(() => {
    let disposed = false;
    let stopTelemetry: (() => void) | undefined;

    void Promise.allSettled([loadContentSummary(), createAnonymousSession()]).then(([content, session]) => {
      if (disposed) return;
      const sessionState =
        session.status === 'fulfilled' ? session.value : { id: crypto.randomUUID(), status: 'offline' as const };
      const client = new TelemetryClient({
        clientVersion: 'dev',
        sessionId: sessionState.id,
        getContext: () => ({}),
      });
      stopTelemetry = client.start();
      if (sessionState.status === 'offline') client.track('offline_mode', { reason: 'backend_unavailable' });
      void client.flush();
      setBootstrap({
        content: content.status === 'fulfilled' ? { status: 'ready', summary: content.value } : { status: 'offline' },
        session: sessionState,
      });
      setTelemetry(client);
    });

    return () => {
      disposed = true;
      stopTelemetry?.();
    };
  }, []);

  return (
    <BrowserRouter>
      <ErrorBoundary
        fallback={renderRootError}
        {...(telemetry
          ? {
              onError: (error: Error): void => {
                telemetry.captureError(error);
              },
            }
          : {})}
      >
        <ApplicationRoutes bootstrap={bootstrap} />
      </ErrorBoundary>
    </BrowserRouter>
  );
}

function ApplicationRoutes({ bootstrap }: { bootstrap: BootstrapState }): ReactNode {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Screen>
            <StartPage bootstrap={bootstrap} />
          </Screen>
        }
      />
      <Route
        path="/nickname"
        element={
          <Screen>
            <NicknamePage />
          </Screen>
        }
      />
      <Route
        path="/campaign"
        element={
          <Screen>
            <GamePage />
          </Screen>
        }
      />
      <Route
        path="/tools"
        element={
          <Screen>
            <ToolLab />
          </Screen>
        }
      />
      <Route
        path="/codex"
        element={
          <Screen>
            <PlaceholderPage title={ru.codex} copy={ru.codexCopy} />
          </Screen>
        }
      />
      <Route
        path="/settings"
        element={
          <Screen>
            <PlaceholderPage title={ru.settings} copy={ru.settingsCopy} />
          </Screen>
        }
      />
      <Route
        path="/about"
        element={
          <Screen>
            <PlaceholderPage title={ru.about} copy={ru.aboutCopy} />
          </Screen>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Screen({ children }: { children: ReactNode }): ReactNode {
  const location = useLocation();

  return (
    <ErrorBoundary resetKey={location.pathname} fallback={renderScreenError}>
      <PageLayout>{children}</PageLayout>
    </ErrorBoundary>
  );
}

function PageLayout({ children }: { children: ReactNode }): ReactNode {
  const nickname = readNickname();

  return (
    <main className="app-shell">
      <header className="app-header">
        <Link className="brand" to="/">
          ZERO DAY // ETHICAL OPS
        </Link>
        <span className="session-status">{nickname ? ru.localProfile(nickname) : ru.localMode}</span>
      </header>
      {!saveRepository.persistent && (
        <p className="fine-print" role="status">
          {ru.storageUnavailable}
        </p>
      )}
      {children}
    </main>
  );
}

function StartPage({ bootstrap }: { bootstrap: BootstrapState }): ReactNode {
  const navigate = useNavigate();
  const [draftNickname, setDraftNickname] = useState(readNickname() ?? '');
  const hasSave = Boolean(readNickname());

  function beginNewGame(): void {
    navigate('/nickname', { state: { draftNickname } });
  }

  return (
    <>
      <section className="intro">
        <div className="command">{ru.command}</div>
        <h1 className="wordmark">
          ZERO<span className="wordmark__cursor">_</span>DAY
        </h1>
        <p className="subtitle">{ru.appSubtitle}</p>
      </section>

      <Panel className="entry-panel" title={ru.loginTitle}>
        <label className="form-label" htmlFor="start-nickname">
          {ru.nicknameLabel} <span className="label-note">{ru.nicknameNote}</span>
        </label>
        <div className="terminal-input">
          <span className="terminal-input__prompt">&gt;</span>
          <input
            id="start-nickname"
            value={draftNickname}
            maxLength={16}
            autoComplete="nickname"
            onChange={(event) => {
              setDraftNickname(event.target.value);
            }}
            placeholder="operator_42"
          />
          <span className="terminal-input__cursor" aria-hidden="true">
            ▍
          </span>
        </div>
        <nav className="actions" aria-label={ru.mainMenuLabel}>
          <Button type="button" variant="primary" onClick={beginNewGame}>
            {ru.newGame}
          </Button>
          <Button
            type="button"
            disabled={!hasSave}
            onClick={() => {
              navigate('/campaign');
            }}
          >
            {ru.continueGame} {!hasSave && ru.noSave}
          </Button>
          <Button type="button" disabled>
            {ru.duel}
          </Button>
          <Button
            type="button"
            onClick={() => {
              navigate('/tools');
            }}
          >
            {ru.toolLab}
          </Button>
          <Button
            type="button"
            onClick={() => {
              navigate('/codex');
            }}
          >
            {ru.codex}
          </Button>
          <Button
            type="button"
            onClick={() => {
              navigate('/settings');
            }}
          >
            {ru.settings}
          </Button>
          <Button
            type="button"
            onClick={() => {
              navigate('/about');
            }}
          >
            {ru.about}
          </Button>
        </nav>
        <p className="fine-print">{ru.savedProgress}</p>
      </Panel>

      <ContentStatusPanel content={bootstrap.content} session={bootstrap.session} hasSave={hasSave} />
    </>
  );
}

function NicknamePage(): ReactNode {
  const navigate = useNavigate();
  const location = useLocation();
  const draft = (location.state as { draftNickname?: string } | null)?.draftNickname ?? readNickname() ?? '';
  const [nickname, setNickname] = useState(draft);
  const [error, setError] = useState<NicknameError | 'storage' | null>(null);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = nickname.trim();
    const validationError = validateNickname(value);

    if (validationError) {
      setError(validationError);
      return;
    }

    if (!saveNickname(value)) {
      setError('storage');
      return;
    }

    navigate('/campaign');
  }

  return (
    <Panel className="entry-panel" title={ru.profileTitle}>
      <p className="copy">{ru.nicknamePageCopy}</p>
      <form onSubmit={submit} noValidate>
        <label className="form-label" htmlFor="nickname">
          {ru.nicknameLabel}
        </label>
        <div className="terminal-input">
          <span className="terminal-input__prompt">&gt;</span>
          <input
            id="nickname"
            value={nickname}
            maxLength={16}
            autoComplete="nickname"
            onChange={(event) => {
              setNickname(event.target.value);
              setError(null);
            }}
            placeholder="operator_42"
          />
          <span className="terminal-input__cursor" aria-hidden="true">
            ▍
          </span>
        </div>
        <p className="fine-print">{ru.nicknameHint}</p>
        <p className="form-error" role="alert">
          {error ? ru.errors[error] : ''}
        </p>
        <div className="form-actions">
          <Button
            type="button"
            onClick={() => {
              navigate('/');
            }}
          >
            {ru.back}
          </Button>
          <Button type="submit" variant="primary">
            {ru.saveAndContinue}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function ContentStatusPanel({
  content,
  session,
  hasSave,
}: {
  content: ContentState;
  session: SessionState;
  hasSave: boolean;
}): ReactNode {
  const ready = content.status === 'ready';
  const statusText = ready ? ru.contentReady : content.status === 'offline' ? ru.contentOffline : ru.contentLoading;
  const detail = ready
    ? ru.contentReadyDetail(content.summary.vulnerabilities, content.summary.puzzles)
    : ru.contentOfflineDetail;

  return (
    <Panel aria-live="polite" className="status-panel">
      <div className="status-line">
        <span className={`status-dot ${ready ? 'status-dot--ready' : ''}`} />
        {statusText}
      </div>
      <p className="fine-print">{detail}</p>
      <div className="metrics">
        <div className="metric">
          <span>{ru.metricsStack}</span>
          <strong>{ru.stackValue}</strong>
        </div>
        <div className="metric">
          <span>{ru.metricsSession}</span>
          <strong>{hasSave ? ru.sessionExisting : ru.sessionNew}</strong>
        </div>
        <div className="metric">
          <span>{ru.metricsApi}</span>
          <strong>{session.status === 'ready' ? ru.apiOnline : ru.apiOffline}</strong>
        </div>
        <div className="metric">
          <span>{ru.metricsContent}</span>
          <strong>{ready ? ru.contentReadyMetric : ru.contentLocalMetric}</strong>
        </div>
      </div>
    </Panel>
  );
}

function NodeActionsPanel({
  caseData,
  caseRun,
  selectedNodeId,
  onClose,
}: {
  caseData: Case;
  caseRun: GameState;
  selectedNodeId: string | null;
  onClose: () => void;
}): ReactNode {
  const dispatch = useCaseStore((state) => state.dispatch);
  const [scopeWarning, setScopeWarning] = useState(false);
  const selectedNode = selectedNodeId ? caseData.nodes.find((node) => node.id === selectedNodeId) : undefined;

  return (
    <Panel className="game-screen__node" title={ru.nodeMenu.title}>
      {selectedNode && !caseRun.nodes[selectedNode.id]?.secured ? (
        <NodeContextMenu
          node={selectedNode.id}
          label={selectedNode.label}
          vulns={Object.values(gameContent.vulnerabilities)}
          onScan={(node) => {
            const result = dispatch({ type: 'ScanNode', node });
            setScopeWarning(Boolean(result?.state.pendingScope));
          }}
          onHypothesis={(node, vuln) => {
            const result = dispatch({ type: 'ProposeHypothesis', node, vuln });
            setScopeWarning(Boolean(result?.state.pendingScope));
          }}
          onClose={onClose}
        />
      ) : (
        <p className="campaign-map__selection">{ru.networkMap.selectNode}</p>
      )}
      {scopeWarning ? (
        <p className="campaign-map__warning" role="status">
          {ru.networkMap.scopeWarning}
        </p>
      ) : null}
    </Panel>
  );
}

function PlaceholderPage({ title, copy }: { title: string; copy: string }): ReactNode {
  return (
    <Panel className="page-panel" title={ru.appName}>
      <h1>{title}</h1>
      <p className="copy">{copy}</p>
      <Link className="zd-button zd-button--primary button-link" to="/">
        {ru.backToMenu}
      </Link>
    </Panel>
  );
}

function GamePage(): ReactNode {
  const { caseData, caseId, level } = campaignStart;
  const caseRun = useCaseStore((state) => state.caseRun);
  const start = useCaseStore((state) => state.start);
  const resume = useCaseStore((state) => state.resume);
  const [loaded] = useState(() => saveRepository.load());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [briefingOpen, setBriefingOpen] = useState(true);

  useEffect(() => {
    if (caseRun?.caseId === caseId) return;
    if (loaded.save.caseRun?.caseId === caseId) {
      resume(gameContent, loaded.save.caseRun);
      return;
    }
    start({ caseId, content: gameContent, difficulty: level.difficulty });
  }, [caseId, caseRun?.caseId, level, loaded, resume, start]);

  useEffect(() => startAutosave(saveRepository, () => useCaseStore.getState().caseRun), []);

  if (!caseRun || caseRun.caseId !== caseId) {
    return (
      <Panel className="page-panel" title={ru.appName}>
        {ru.contentLoading}
      </Panel>
    );
  }

  const levelNumber = gameContent.campaign.levels.indexOf(level) + 1;

  return (
    <section className="game-screen" aria-label={ru.campaign}>
      {briefingOpen ? (
        <BriefingModal
          caseData={caseData}
          onClose={() => {
            setBriefingOpen(false);
          }}
        />
      ) : null}
      <GameHud caseData={caseData} caseRun={caseRun} flipper={gameContent.flipper} level={levelNumber} />
      <div className="game-screen__map">
        <NetworkMap
          caseData={caseData}
          gameState={caseRun}
          onSelectNode={setSelectedNodeId}
          selectedNodeId={selectedNodeId}
        />
      </div>
      <Panel className="game-screen__brief" title={ru.briefTitle(caseData.brief.client)}>
        <p className="copy">{caseData.brief.text}</p>
        {(loaded.status === 'case-reset' || loaded.status === 'corrupt') && (
          <p className="fine-print" role="status">
            {ru.saveCaseReset}
          </p>
        )}
      </Panel>
      <NodeActionsPanel
        key={selectedNodeId ?? ''}
        caseData={caseData}
        caseRun={caseRun}
        selectedNodeId={selectedNodeId}
        onClose={() => {
          setSelectedNodeId(null);
        }}
      />
      <div className="game-screen__terminal">
        <Terminal vulns={Object.values(gameContent.vulnerabilities)} />
      </div>
      <PuzzleHost />
      <Link className="zd-button button-link game-screen__back" to="/">
        {ru.backToMenu}
      </Link>
    </section>
  );
}

function renderRootError(_: Error, retry: () => void): ReactNode {
  return <ErrorPage retry={retry} />;
}

function renderScreenError(_: Error, retry: () => void): ReactNode {
  return (
    <main className="app-shell">
      <ErrorPage retry={retry} />
    </main>
  );
}

function ErrorPage({ retry }: { retry: () => void }): ReactNode {
  return (
    <Panel className="page-panel error-panel" tone="danger">
      <h1>{ru.screenErrorTitle}</h1>
      <p className="copy">{ru.screenErrorCopy}</p>
      <Button
        type="button"
        variant="primary"
        onClick={() => {
          retry();
          window.location.assign('/');
        }}
      >
        {ru.backToMenu}
      </Button>
    </Panel>
  );
}
