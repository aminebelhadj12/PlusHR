let inMemoryAccessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function rawFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  if (inMemoryAccessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryAccessToken}`);
  }
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
}

export async function apiRequest<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  let res = await rawFetch(url, options);

  if (res.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/refresh')) {
    const refreshRes = await rawFetch('/api/auth/refresh', { method: 'POST' });
    if (refreshRes.ok) {
      const data = (await refreshRes.json()) as { accessToken?: string };
      if (data.accessToken) {
        inMemoryAccessToken = data.accessToken;
        res = await rawFetch(url, options);
      }
    }
  }

  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const msg =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: string }).error)
        : `Erreur HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }

  return payload as T;
}
