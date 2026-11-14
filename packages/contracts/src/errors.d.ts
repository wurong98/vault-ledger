/**
 * 统一错误码。服务端与前端共用。
 * 语义：不可携带秘密信息，不回显原始敏感输入。
 */
export declare const ERROR_CODES: readonly ["LOCKED", "SETUP_REQUIRED", "LLM_CONFIG_REQUIRED", "SETUP_ALREADY_DONE", "INVALID_PASSWORD_OR_BACKUP", "MODEL_UNAVAILABLE", "MODEL_RESPONSE_INVALID", "VALIDATION_FAILED", "REVISION_CONFLICT", "IDEMPOTENCY_CONFLICT", "UNSUPPORTED_BACKUP_VERSION", "BACKUP_INTEGRITY_FAILED", "BACKUP_TOO_LARGE", "LIMIT_EXCEEDED", "RATE_LIMITED", "STORAGE_LOCKED", "NOT_FOUND", "FORBIDDEN", "EXTRACTION_TIMEOUT", "INTERNAL_ERROR"];
export type ErrorCode = (typeof ERROR_CODES)[number];
export interface ApiErrorBody {
    code: ErrorCode;
    message: string;
    requestId?: string;
    /** 仅安全的字段级提示，例如 { amount: '金额最多两位小数' } */
    fields?: Record<string, string>;
}
export declare function statusForError(code: ErrorCode): number;
