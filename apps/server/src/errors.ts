import { statusForError, type ApiErrorBody, type ErrorCode } from '@ledgerbox/contracts';

/** 业务错误：携带稳定错误码与安全消息。 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fields?: Record<string, string>;
  readonly retryAfterSeconds?: number;
  readonly status: number;

  constructor(
    code: ErrorCode,
    message: string,
    fields?: Record<string, string>,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.fields = fields;
    this.retryAfterSeconds = retryAfterSeconds;
    this.status = statusForError(code);
  }

  toBody(requestId?: string): ApiErrorBody {
    const body: ApiErrorBody = { code: this.code, message: this.message };
    if (requestId) body.requestId = requestId;
    if (this.fields) body.fields = this.fields;
    if (this.retryAfterSeconds !== undefined) {
      body.retryAfterSeconds = this.retryAfterSeconds;
    }
    return body;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
