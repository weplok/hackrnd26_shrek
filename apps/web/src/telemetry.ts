export type TelemetryEventName =
  | 'case_started'
  | 'case_finished'
  | 'step_finished'
  | 'puzzle_attempted'
  | 'puzzle_finished'
  | 'scope_warning'
  | 'scope_confirmed'
  | 'checkpoint_restored'
  | 'save_restored'
  | 'offline_mode'
  | 'client_error';

type TelemetryValue = string | number | boolean;
type TelemetryPayload = Record<string, TelemetryValue>;

export interface TelemetryContext {
  caseId?: string;
  seed?: string;
  lastCommands?: readonly string[];
}

export interface TelemetryClientOptions {
  clientVersion: string;
  getContext: () => TelemetryContext;
  sessionId: string;
  endpoint?: string;
}

interface TelemetryEvent {
  event_id: string;
  event_type: TelemetryEventName;
  occurred_at: string;
  session_id: string;
  client_version: string;
  case_id?: string;
  payload: TelemetryPayload;
}

const BATCH_SIZE = 20;

export class TelemetryClient {
  private readonly endpoint: string;
  private readonly options: TelemetryClientOptions;
  private events: TelemetryEvent[] = [];
  private flushing = false;

  constructor(options: TelemetryClientOptions) {
    this.options = options;
    this.endpoint = options.endpoint ?? '/telemetry';
  }

  start(): () => void {
    const onError = (event: ErrorEvent): void => {
      this.captureError(event.error ?? event.message);
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
      this.captureError(event.reason);
    };
    const onPageHide = (): void => {
      void this.flush(true);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.removeEventListener('pagehide', onPageHide);
    };
  }

  track(eventType: TelemetryEventName, payload: TelemetryPayload = {}): void {
    const context = this.options.getContext();
    const event: TelemetryEvent = {
      event_id: crypto.randomUUID(),
      event_type: eventType,
      occurred_at: new Date().toISOString(),
      session_id: this.options.sessionId,
      client_version: this.options.clientVersion,
      payload,
    };
    if (context.caseId) event.case_id = context.caseId;
    this.events.push(event);
  }

  async flush(useBeacon = false): Promise<void> {
    if (this.flushing || this.events.length === 0) return;
    this.flushing = true;
    const events = this.events.splice(0, BATCH_SIZE);
    const body = JSON.stringify({ events });
    try {
      if (useBeacon && navigator.sendBeacon(this.endpoint, new Blob([body], { type: 'application/json' }))) return;
      const response = await fetch(this.endpoint, {
        method: 'POST',
        body,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        keepalive: useBeacon,
      });
      if (!response.ok) throw new Error(`Telemetry request failed: ${String(response.status)}`);
    } catch {
      this.events.unshift(...events);
    } finally {
      this.flushing = false;
    }
  }

  public captureError(error: unknown): void {
    const context = this.options.getContext();
    const stack = error instanceof Error ? (error.stack ?? error.message) : String(error);
    this.track('client_error', {
      stack: stack.slice(0, 4096),
      last_commands: JSON.stringify(context.lastCommands?.slice(-5) ?? []).slice(0, 4096),
      seed: context.seed ?? '',
    });
    void this.flush();
  }
}
