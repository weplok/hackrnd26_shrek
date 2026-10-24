export type SessionState = {
  id: string;
  status: 'ready' | 'offline';
};

export async function createAnonymousSession(): Promise<SessionState> {
  try {
    const response = await fetch('/api/v1/sessions', { method: 'POST' });
    const payload: unknown = response.ok ? await response.json() : null;

    if (typeof payload === 'object' && payload !== null && typeof (payload as { session_id?: unknown }).session_id === 'string') {
      return { id: (payload as { session_id: string }).session_id, status: 'ready' };
    }
  } catch {
    // Offline campaign still uses a locally generated anonymous session.
  }

  return { id: crypto.randomUUID(), status: 'offline' };
}
