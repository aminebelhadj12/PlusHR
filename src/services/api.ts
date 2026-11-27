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

let pendingRefresh: Promise<boolean> | undefined;

function refreshAccessToken(): Promise<boolean> {
  pendingRefresh ??= (async () => {
    const response = await rawFetch('/api/auth/refresh', { method: 'POST' });
    if (!response.ok) return false;
    const data = (await response.json()) as { accessToken?: string };
    if (!data.accessToken) return false;
    inMemoryAccessToken = data.accessToken;
    return true;
  })().finally(() => { pendingRefresh = undefined; });
  return pendingRefresh;
}

async function authenticatedFetch(url: string, options: RequestInit): Promise<Response> {
  const previousToken = inMemoryAccessToken;
  let res = await rawFetch(url, options);

  if (res.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/refresh')) {
    if ((inMemoryAccessToken && previousToken !== inMemoryAccessToken) || await refreshAccessToken()) {
      res = await rawFetch(url, options);
    }
  }

  return res;
}

async function readPayload(res: Response) {
  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const msg =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: string }).error)
        : `Erreur HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }

  return payload;
}

export async function apiRequest<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  return await readPayload(await authenticatedFetch(url, options)) as T;
}

export async function apiDownload(url: string, options: RequestInit): Promise<Blob> {
  const response = await authenticatedFetch(url, options);
  if (!response.ok) await readPayload(response);
  return response.blob();
}

export async function apiStream<T>(url: string, options: RequestInit, onEvent: (event: T) => void): Promise<void> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/x-ndjson');
  const response = await authenticatedFetch(url, { ...options, headers });
  if (!response.ok) await readPayload(response);
  if (!response.body || !response.headers.get('content-type')?.includes('application/x-ndjson')) {
    throw new ApiError('Unexpected response format.', response.status);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const lines = (buffer + value).split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as T);
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer) as T);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
