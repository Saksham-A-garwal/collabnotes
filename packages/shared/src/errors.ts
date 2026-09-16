// Standard error envelope + codes. Source of truth: SRS §8.

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "REFRESH_TOKEN_INVALID_OR_REUSED"
  | "FORBIDDEN"
  | "DOCUMENT_NOT_FOUND"
  | "EMAIL_ALREADY_EXISTS"
  | "SHARE_LINK_REVOKED"
  | "SHARE_LINK_INVALID"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type ErrorEnvelope = {
  error: {
    code: ErrorCode;
    message: string;
  };
};

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  REFRESH_TOKEN_INVALID_OR_REUSED: 401,
  FORBIDDEN: 403,
  DOCUMENT_NOT_FOUND: 404,
  EMAIL_ALREADY_EXISTS: 409,
  SHARE_LINK_REVOKED: 410,
  SHARE_LINK_INVALID: 410,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  code: ErrorCode;
  status: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.status = ERROR_STATUS[code];
  }

  toEnvelope(): ErrorEnvelope {
    return { error: { code: this.code, message: this.message } };
  }
}
