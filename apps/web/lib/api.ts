import { useAuthStore } from './auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  orgSlug?: string;
}

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  // De-dupe concurrent 401s into a single refresh round-trip.
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { accessToken: string };
      useAuthStore.getState().setAuth(data.accessToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function request<T>(path: string, opts: RequestOptions = {}, retry = true): Promise<T> {
  const { body, orgSlug, headers, ...rest } = opts;
  const token = useAuthStore.getState().accessToken;

  const res = await fetch(`${API_URL}/api${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(orgSlug ? { 'x-org-slug': orgSlug } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry) {
    const fresh = await refreshAccessToken();
    if (fresh) return request<T>(path, opts, false);
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (errBody as { message?: string }).message ?? res.statusText, errBody);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, orgSlug?: string) => request<T>(path, { method: 'GET', orgSlug }),
  post: <T>(path: string, body?: unknown, orgSlug?: string) =>
    request<T>(path, { method: 'POST', body, orgSlug }),
  patch: <T>(path: string, body?: unknown, orgSlug?: string) =>
    request<T>(path, { method: 'PATCH', body, orgSlug }),
  delete: <T>(path: string, orgSlug?: string) =>
    request<T>(path, { method: 'DELETE', orgSlug }),
};

export { API_URL };
