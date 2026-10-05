import type { ApiErrorBody, AuthSession } from '@hydra/shared';
import { config } from '../config';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: { path: string; message: string }[],
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field errors keyed by path, for react-hook-form `setError`. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details ?? []) out[d.path] ??= d.message;
    return out;
  }
}

export const isNetworkError = (e: unknown): boolean => e instanceof ApiError && e.code === 'NETWORK';

/** Friendly message for any thrown error — never raw stack traces or SQL (spec §22). */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Something went wrong. Please try again.';
}

interface TokenBridge {
  getAccessToken: () => string | null;
  refresh: () => Promise<AuthSession | null>;
  onSessionExpired: () => void;
}

let bridge: TokenBridge = { getAccessToken: () => null, refresh: async () => null, onSessionExpired: () => undefined };

export function configureAuthBridge(b: TokenBridge): void {
  bridge = b;
}

let refreshing: Promise<AuthSession | null> | null = null;

async function refreshOnce(): Promise<AuthSession | null> {
  refreshing ??= bridge.refresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  idempotencyKey?: string;
  auth?: boolean;
  formData?: FormData;
  timeoutMs?: number;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  return `${config.apiUrl}/api/v1${path}${qs ? `?${qs}` : ''}`;
}

async function send(method: string, path: string, opts: RequestOptions, token: string | null): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  let body: BodyInit | undefined;
  if (opts.formData) body = opts.formData;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  try {
    return await fetch(buildUrl(path, opts.query), { method, headers, body, signal: controller.signal });
  } catch {
    const devHint = config.isProduction ? '' : ` (development: API ${config.apiUrl})`;
    throw new ApiError(0, 'NETWORK', `You appear to be offline or the server is unreachable. Check your connection and try again.${devHint}`);
  } finally {
    clearTimeout(timer);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const err = (json as ApiErrorBody | undefined)?.error;
    throw new ApiError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? `Request failed (${res.status})`, err?.details, err?.requestId);
  }
  return json as T;
}

/**
 * Typed JSON request. On 401 the access token is refreshed once (single-flight, rotating refresh
 * token) and the request retried; if refresh fails the session is cleared.
 */
export async function apiRequest<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, opts: RequestOptions = {}): Promise<T> {
  const useAuth = opts.auth !== false;
  let res = await send(method, path, opts, useAuth ? bridge.getAccessToken() : null);
  if (res.status === 401 && useAuth && bridge.getAccessToken()) {
    const session = await refreshOnce();
    if (!session) {
      bridge.onSessionExpired();
      return parse<T>(res);
    }
    res = await send(method, path, opts, session.accessToken);
  }
  return parse<T>(res);
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => apiRequest<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown, extra?: Omit<RequestOptions, 'body'>) => apiRequest<T>('POST', path, { ...extra, body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>('PATCH', path, { body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>('PUT', path, { body: body ?? {} }),
  delete: <T>(path: string, body?: unknown) => apiRequest<T>('DELETE', path, { body }),
  upload: <T>(path: string, form: FormData) => apiRequest<T>('POST', path, { formData: form, timeoutMs: 60_000 }),
  /** Binary-safe download (CSV/PDF exports) with the server-provided filename and row count. */
  download: async (path: string, body?: unknown): Promise<{ bytes: Uint8Array; fileName: string; contentType: string; rowCount: number | null }> => {
    // GET for documents (invoice PDF), POST when a request body describes the export.
    const method = body === undefined ? 'GET' : 'POST';
    let res = await send(method, path, { body }, bridge.getAccessToken());
    if (res.status === 401) {
      const s = await refreshOnce();
      if (s) res = await send(method, path, { body }, s.accessToken);
    }
    if (!res.ok) await parse(res);
    const cd = res.headers.get('content-disposition') ?? '';
    const rows = res.headers.get('x-row-count');
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      fileName: /filename="([^"]+)"/.exec(cd)?.[1] ?? 'export.csv',
      contentType: res.headers.get('content-type') ?? 'text/csv',
      rowCount: rows !== null && Number.isFinite(Number(rows)) ? Number(rows) : null,
    };
  },
};

export function newIdempotencyKey(): string {
  const rand = Math.random().toString(36).slice(2, 12);
  return `m-${Date.now().toString(36)}-${rand}`;
}
