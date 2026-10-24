export type SessionState = 'ready' | 'offline';

export async function createAnonymousSession(): Promise<SessionState> {
  try {
    const response = await fetch('/api/v1/sessions', { method: 'POST' });
    return response.ok ? 'ready' : 'offline';
  } catch {
    return 'offline';
  }
}
