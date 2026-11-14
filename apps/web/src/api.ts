export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { raw?: boolean } = {},
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body instanceof Blob || options.body instanceof ArrayBuffer
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    let body: {
      code?: string;
      message?: string;
      fields?: Record<string, string>;
      retryAfterSeconds?: number;
    } = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    throw new ApiError(
      body.code ?? 'INTERNAL_ERROR',
      body.message ?? `请求失败（${response.status}）`,
      body.fields,
      body.retryAfterSeconds,
    );
  }
  if (options.raw) return response as unknown as T;
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, file: Blob, headers?: Record<string, string>) =>
    request<T>(path, {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream', ...(headers ?? {}) },
    }),
};

export function newIdempotencyKey(): string {
  return `idem-${Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
