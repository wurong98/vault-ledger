export class ApiError extends Error {
    code;
    fields;
    constructor(code, message, fields) {
        super(message);
        this.code = code;
        this.fields = fields;
    }
}
async function request(path, options = {}) {
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
        let body = {};
        try {
            body = await response.json();
        }
        catch {
            body = {};
        }
        throw new ApiError(body.code ?? 'INTERNAL_ERROR', body.message ?? `请求失败（${response.status}）`, body.fields);
    }
    if (options.raw)
        return response;
    if (response.status === 204)
        return undefined;
    return (await response.json());
}
export const api = {
    get: (path) => request(path),
    post: (path, body, headers) => request(path, {
        method: 'POST',
        body: body === undefined ? undefined : JSON.stringify(body),
        headers,
    }),
    patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (path) => request(path, { method: 'DELETE' }),
    upload: (path, file, headers) => request(path, {
        method: 'POST',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream', ...(headers ?? {}) },
    }),
};
export function newIdempotencyKey() {
    return `idem-${crypto.randomUUID()}`;
}
//# sourceMappingURL=api.js.map