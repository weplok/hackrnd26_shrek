import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { loadContentSummary, type ContentSummary } from '../shared/content/loadContent';
import { readNickname, saveNickname } from '../shared/profile/storage';
import { validateNickname, type NicknameError } from '../shared/profile/nickname';
import { createAnonymousSession, type SessionState } from '../shared/session/createSession';
import { ru } from '../shared/ui/strings';

type ContentState =
  | { status: 'loading' }
  | { status: 'ready'; summary: ContentSummary }
  | { status: 'offline' };

type BootstrapState = {
  content: ContentState;
  session: SessionState;
};

const initialBootstrapState: BootstrapState = {
  content: { status: 'loading' },
  session: 'offline',
};

export function App(): ReactNode {
  const [bootstrap, setBootstrap] = useState<BootstrapState>(initialBootstrapState);

  useEffect(() => {
    void Promise.allSettled([loadContentSummary(), createAnonymousSession()]).then(([content, session]) => {
      setBootstrap({
        content: content.status === 'fulfilled' ? { status: 'ready', summary: content.value } : { status: 'offline' },
        session: session.status === 'fulfilled' ? session.value : 'offline',
      });
    });
  }, []);

  return (
    <BrowserRouter>
      <ErrorBoundary fallback={renderRootError}>
        <ApplicationRoutes bootstrap={bootstrap} />
      </ErrorBoundary>
    </BrowserRouter>
  );
}

function ApplicationRoutes({ bootstrap }: { bootstrap: BootstrapState }): ReactNode {
  return (
    <Routes>
      <Route path="/" element={<Screen><StartPage bootstrap={bootstrap} /></Screen>} />
      <Route path="/nickname" element={<Screen><NicknamePage /></Screen>} />
      <Route path="/campaign" element={<Screen><PlaceholderPage title={ru.campaign} copy={ru.campaignCopy} /></Screen>} />
      <Route path="/codex" element={<Screen><PlaceholderPage title={ru.codex} copy={ru.codexCopy} /></Screen>} />
      <Route path="/settings" element={<Screen><PlaceholderPage title={ru.settings} copy={ru.settingsCopy} /></Screen>} />
      <Route path="/about" element={<Screen><PlaceholderPage title={ru.about} copy={ru.aboutCopy} /></Screen>} />
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
        <Link className="brand" to="/">ZERO DAY // ETHICAL OPS</Link>
        <span className="session-status">{nickname ? ru.localProfile(nickname) : ru.localMode}</span>
      </header>
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
        <h1 className="wordmark">ZERO<span className="wordmark__cursor">_</span>DAY</h1>
        <p className="subtitle">{ru.appSubtitle}</p>
      </section>

      <section className="panel entry-panel" aria-labelledby="login-title">
        <div className="panel-title" id="login-title"><PanelLights />{ru.loginTitle}</div>
        <div className="panel-body">
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
              onChange={(event) => setDraftNickname(event.target.value)}
              placeholder="operator_42"
            />
            <span className="terminal-input__cursor" aria-hidden="true">▍</span>
          </div>
          <nav className="actions" aria-label={ru.mainMenuLabel}>
            <button className="button button--primary" type="button" onClick={beginNewGame}>{ru.newGame}</button>
            <button className="button" type="button" disabled={!hasSave} onClick={() => navigate('/campaign')}>
              {ru.continueGame} {!hasSave && ru.noSave}
            </button>
            <button className="button" type="button" disabled>{ru.duel}</button>
            <button className="button" type="button" onClick={() => navigate('/codex')}>{ru.codex}</button>
            <button className="button" type="button" onClick={() => navigate('/settings')}>{ru.settings}</button>
            <button className="button" type="button" onClick={() => navigate('/about')}>{ru.about}</button>
          </nav>
          <p className="fine-print">{ru.savedProgress}</p>
        </div>
      </section>

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
    <section className="panel entry-panel" aria-labelledby="profile-title">
      <div className="panel-title" id="profile-title"><PanelLights />{ru.profileTitle}</div>
      <div className="panel-body">
        <p className="copy">{ru.nicknamePageCopy}</p>
        <form onSubmit={submit} noValidate>
          <label className="form-label" htmlFor="nickname">{ru.nicknameLabel}</label>
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
              autoFocus
            />
            <span className="terminal-input__cursor" aria-hidden="true">▍</span>
          </div>
          <p className="fine-print">{ru.nicknameHint}</p>
          <p className="form-error" role="alert">{error ? ru.errors[error] : ''}</p>
          <div className="form-actions">
            <button className="button" type="button" onClick={() => navigate('/')}>{ru.back}</button>
            <button className="button button--primary" type="submit">{ru.saveAndContinue}</button>
          </div>
        </form>
      </div>
    </section>
  );
}

function ContentStatusPanel({ content, session, hasSave }: { content: ContentState; session: SessionState; hasSave: boolean }): ReactNode {
  const ready = content.status === 'ready';
  const statusText = ready ? ru.contentReady : content.status === 'offline' ? ru.contentOffline : ru.contentLoading;
  const detail = ready ? ru.contentReadyDetail(content.summary.vulnerabilities, content.summary.puzzles) : ru.contentOfflineDetail;

  return (
    <aside className="panel status-panel" aria-live="polite">
      <div className="panel-body">
        <div className="status-line"><span className={`status-dot ${ready ? 'status-dot--ready' : ''}`} />{statusText}</div>
        <p className="fine-print">{detail}</p>
        <div className="metrics">
          <div className="metric"><span>{ru.metricsStack}</span><strong>{ru.stackValue}</strong></div>
          <div className="metric"><span>{ru.metricsSession}</span><strong>{hasSave ? ru.sessionExisting : ru.sessionNew}</strong></div>
          <div className="metric"><span>{ru.metricsApi}</span><strong>{session === 'ready' ? ru.apiOnline : ru.apiOffline}</strong></div>
          <div className="metric"><span>{ru.metricsContent}</span><strong>{ready ? ru.contentReadyMetric : ru.contentLocalMetric}</strong></div>
        </div>
      </div>
    </aside>
  );
}

function PlaceholderPage({ title, copy }: { title: string; copy: string }): ReactNode {
  return (
    <section className="panel page-panel">
      <div className="panel-title"><PanelLights />{ru.appName}</div>
      <div className="panel-body">
        <h1>{title}</h1>
        <p className="copy">{copy}</p>
        <Link className="button button--primary button--inline" to="/">{ru.backToMenu}</Link>
      </div>
    </section>
  );
}

function PanelLights(): ReactNode {
  return <span className="lights" aria-hidden="true"><i className="light light--magenta" /><i className="light light--amber" /><i className="light light--green" /></span>;
}

function renderRootError(_: Error, retry: () => void): ReactNode {
  return <ErrorPage retry={retry} />;
}

function renderScreenError(_: Error, retry: () => void): ReactNode {
  return <main className="app-shell"><ErrorPage retry={retry} /></main>;
}

function ErrorPage({ retry }: { retry: () => void }): ReactNode {
  return (
    <section className="panel page-panel error-panel">
      <div className="panel-body">
        <h1>{ru.screenErrorTitle}</h1>
        <p className="copy">{ru.screenErrorCopy}</p>
        <button className="button button--primary" type="button" onClick={() => { retry(); window.location.assign('/'); }}>{ru.backToMenu}</button>
      </div>
    </section>
  );
}
