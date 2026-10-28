/**
 * Typed fetch client for the MediData API.
 *
 * - Always unwraps the canonical `ApiEnvelope<T>` from @medidata/shared.
 * - Throws typed `ApiError { code, message, status }` on HTTP errors, network
 *   failures and `success: false` envelopes (so DQ_GATE_FAILED etc. surface
 *   as structured codes the UI can branch on).
 * - Sends `credentials: 'include'` (cookie session) plus a Bearer fallback
 *   from localStorage("medidata_token").
 * - Supports TanStack Query cancellation via `?signal`.
 * - Emits online/offline events from the fetch error path so the shell can
 *   render a compact "API offline" banner instead of a blank screen.
 */
import { API_BASE } from '@medidata/shared';

const TOKEN_KEY = 'medidata_token';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }

  /** True when the API could not be reached at all (server down). */
  get isOffline(): boolean {
    return this.code === 'NETWORK_ERROR';
  }
}

// ---------------------------------------------------------------------------
// Online/offline event bus (drives the API-offline banner in the shell)
// ---------------------------------------------------------------------------

export type ApiEvent = { type: 'online' | 'offline' };
type ApiEventHandler = (event: ApiEvent) => void;

const apiEventHandlers = new Set<ApiEventHandler>();

export function subscribeApiEvents(handler: ApiEventHandler): () => void {
  apiEventHandlers.add(handler);
  return () => {
    apiEventHandlers.delete(handler);
  };
}

function emitApiEvent(event: ApiEvent): void {
  for (const handler of apiEventHandlers) handler(event);
}

/** Global error notifier hook point (wired to the toast system by providers). */
export type ApiErrorNotifier = (error: ApiError) => void;
let errorNotifier: ApiErrorNotifier | null = null;

export function setApiErrorNotifier(notifier: ApiErrorNotifier | null): void {
  errorNotifier = notifier;
}

// ---------------------------------------------------------------------------
// Token helpers (safe in SSR / node test environments)
// ---------------------------------------------------------------------------

export function getStoredToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function storeToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable — cookie session still works */
  }
}

export function clearStoredToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function handleUnauthorized(): void {
  clearStoredToken();
  if (typeof window === 'undefined') return;
  if (!window.location.pathname.startsWith('/login')) {
    window.location.assign('/login?expired=1');
  }
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export type ApiFetchOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** AbortSignal for TanStack Query cancellation. */
  signal?: AbortSignal;
  /** Skip the automatic 401 → /login redirect (used by the login form). */
  skipAuthRedirect?: boolean;
  /** Suppress the global error toast for this call (page renders its own). */
  silent?: boolean;
};

type EnvelopeLike = {
  success?: boolean;
  data?: unknown;
  error?: { code?: string; message?: string };
};

function asEnvelope(json: unknown): EnvelopeLike | null {
  if (typeof json !== 'object' || json === null) return null;
  const candidate = json as Record<string, unknown>;
  if (!('success' in candidate)) return null;
  return candidate as unknown as EnvelopeLike;
}

function notify(error: ApiError, opts: ApiFetchOptions): void {
  if (opts.silent) return;
  errorNotifier?.(error);
}

export async function apiFetch<T>(
  path: string,
  opts: ApiFetchOptions = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const token = getStoredToken();
  if (token) headers['authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'include',
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    if (err instanceof Error && err.name === 'AbortError') throw err;
    emitApiEvent({ type: 'offline' });
    const error = new ApiError(
      'NETWORK_ERROR',
      'API offline — start apps/api (was the request blocked by CORS?)',
      0,
    );
    notify(error, opts);
    throw error;
  }

  emitApiEvent({ type: 'online' });

  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = null;
    }
  }
  const envelope = asEnvelope(json);

  if (!res.ok) {
    if (res.status === 401 && !opts.skipAuthRedirect) handleUnauthorized();
    const error = new ApiError(
      envelope?.error?.code ?? `HTTP_${res.status}`,
      envelope?.error?.message ?? res.statusText ?? `HTTP ${res.status}`,
      res.status,
    );
    notify(error, opts);
    throw error;
  }

  if (envelope === null) {
    // Non-envelope success body (raw passthrough, e.g. proxy endpoints).
    return json as T;
  }

  if (envelope.success === false) {
    const status = res.status >= 400 ? res.status : 400;
    if (envelope.error?.code === 'UNAUTHORIZED' && !opts.skipAuthRedirect) {
      handleUnauthorized();
    }
    const error = new ApiError(
      envelope.error?.code ?? 'REQUEST_FAILED',
      envelope.error?.message ?? 'Request failed',
      status,
    );
    notify(error, opts);
    throw error;
  }

  return envelope.data as T;
}

/** Download a file (e.g. portal result PDF) through the same auth path. */
export async function apiDownload(
  path: string,
  opts: { signal?: AbortSignal } = {},
): Promise<{ blob: Blob; filename: string }> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers: Record<string, string> = {};
  const token = getStoredToken();
  if (token) headers['authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, { headers, credentials: 'include', signal: opts.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    emitApiEvent({ type: 'offline' });
    throw new ApiError(
      'NETWORK_ERROR',
      'API offline — start apps/api (was the request blocked by CORS?)',
      0,
    );
  }
  emitApiEvent({ type: 'online' });

  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new ApiError(`HTTP_${res.status}`, `Download failed (HTTP ${res.status})`, res.status);
  }

  const disposition = res.headers.get('content-disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const blob = await res.blob();
  return { blob, filename: match?.[1] ?? 'download' };
}

/** Trigger a browser save dialog for a fetched blob. */
export function saveBlob(blob: Blob, filename: string): void {
  if (typeof window === 'undefined') return;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
