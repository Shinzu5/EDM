import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiFetch,
  clearStoredToken,
  getStoredToken,
  setApiErrorNotifier,
  storeToken,
  subscribeApiEvents,
} from './api';
import type { ApiEvent } from './api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('lib/api — envelope unwrapping', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    setApiErrorNotifier(null);
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', fetchMock);
    clearStoredToken();
  });

  afterEach(() => {
    setApiErrorNotifier(null);
    vi.unstubAllGlobals();
  });

  it('unwraps success envelopes and returns data', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, data: [{ id: 'p1', mrn: 'MRN1' }] }),
    );
    const data = await apiFetch<Array<{ id: string; mrn: string }>>('/api/patients');
    expect(data).toEqual([{ id: 'p1', mrn: 'MRN1' }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/patients');
    expect(init.credentials).toBe('include');
  });

  it('throws typed ApiError with code/message on success:false', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { success: false, error: { code: 'DQ_GATE_FAILED', message: 'critical DQ rules failing' } },
        422,
      ),
    );
    const failure = apiFetch('/api/ml/risk/x');
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await failure.catch((error: ApiError) => {
      expect(error.code).toBe('DQ_GATE_FAILED');
      expect(error.message).toContain('critical DQ');
      expect(error.status).toBe(422);
      expect(error.isOffline).toBe(false);
    });
  });

  it('throws ApiError on HTTP errors carrying envelope error details', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, error: { code: 'FORBIDDEN', message: 'role lacks access' } }, 403),
    );
    await expect(apiFetch('/api/governance/audit')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });

  it('maps network failures to NETWORK_ERROR, emits offline and marks isOffline', async () => {
    const events: ApiEvent[] = [];
    const unsubscribe = subscribeApiEvents((event) => events.push(event));
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const failure = apiFetch('/api/patients');
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await failure.catch((error: ApiError) => {
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.isOffline).toBe(true);
      expect(error.message).toContain('API offline');
    });
    expect(events).toEqual([{ type: 'offline' }]);
    unsubscribe();
  });

  it('emits online on successful calls', async () => {
    const events: ApiEvent[] = [];
    const unsubscribe = subscribeApiEvents((event) => events.push(event));
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: 'ok' }));
    await expect(apiFetch('/health')).resolves.toBe('ok');
    expect(events).toEqual([{ type: 'online' }]);
    unsubscribe();
  });

  it('sends Bearer fallback token from localStorage', async () => {
    const localStorageStore = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => localStorageStore.get(key) ?? null,
        setItem: (key: string, value: string) => void localStorageStore.set(key, value),
        removeItem: (key: string) => void localStorageStore.delete(key),
      },
    });
    storeToken('token-abc');
    expect(getStoredToken()).toBe('token-abc');

    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: null }));
    await apiFetch('/api/auth/me');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-abc');

    clearStoredToken();
    expect(getStoredToken()).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('redirects to /login on 401 unless skipAuthRedirect is set', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', {
      location: { pathname: '/patients', assign },
      localStorage: { getItem: () => null },
    });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'no session' } }, 401),
    );
    await expect(apiFetch('/api/auth/me', { silent: true })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
    expect(assign).toHaveBeenCalledWith('/login?expired=1');

    assign.mockClear();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'bad credentials' } }, 401),
    );
    await expect(
      apiFetch('/api/auth/login', { method: 'POST', skipAuthRedirect: true, silent: true }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(assign).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('passes the TanStack cancellation signal through to fetch', async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: 1 }));
    await apiFetch('/api/patients', { signal: controller.signal });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it('notifies the global error hook (toast bridge point)', async () => {
    const notifier = vi.fn();
    setApiErrorNotifier(notifier);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, error: { code: 'SERVER_ERROR', message: 'boom' } }, 500),
    );
    await expect(apiFetch('/api/claims')).rejects.toBeInstanceOf(ApiError);
    expect(notifier).toHaveBeenCalledTimes(1);
    expect((notifier.mock.calls[0][0] as ApiError).code).toBe('SERVER_ERROR');
    setApiErrorNotifier(null);
  });
});
