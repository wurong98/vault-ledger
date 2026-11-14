export declare class ApiError extends Error {
    readonly code: string;
    readonly fields?: Record<string, string> | undefined;
    constructor(code: string, message: string, fields?: Record<string, string> | undefined);
}
export declare const api: {
    get: <T>(path: string) => Promise<T>;
    post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
    patch: <T>(path: string, body: unknown) => Promise<T>;
    delete: <T>(path: string) => Promise<T>;
    upload: <T>(path: string, file: Blob, headers?: Record<string, string>) => Promise<T>;
};
export declare function newIdempotencyKey(): string;
