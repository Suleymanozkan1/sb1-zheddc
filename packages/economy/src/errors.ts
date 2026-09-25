export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INSUFFICIENT_FUNDS"
  | "INVALID_SIGNATURE"
  | "NONCE_EXPIRED"
  | "ALREADY_OWNED"
  | "ALREADY_CLAIMED"
  | "INVENTORY_FULL"
  | "LIMIT_EXCEEDED"
  | "COOLDOWN"
  | "REGION_RESTRICTED"
  | "ACCOUNT_RESTRICTED"
  | "DUPLICATE_TRANSACTION"
  | "VERIFICATION_PENDING"
  | "VERIFICATION_FAILED"
  | "NOT_CONFIGURED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INSUFFICIENT_FUNDS: 409,
  INVALID_SIGNATURE: 401,
  NONCE_EXPIRED: 401,
  ALREADY_OWNED: 409,
  ALREADY_CLAIMED: 409,
  INVENTORY_FULL: 409,
  LIMIT_EXCEEDED: 422,
  COOLDOWN: 429,
  REGION_RESTRICTED: 451,
  ACCOUNT_RESTRICTED: 403,
  DUPLICATE_TRANSACTION: 409,
  VERIFICATION_PENDING: 202,
  VERIFICATION_FAILED: 422,
  NOT_CONFIGURED: 503,
  INTERNAL: 500,
};

/** Domain error with a stable machine-readable code (safe to show to clients). */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export function assert(condition: unknown, code: ErrorCode, message: string): asserts condition {
  if (!condition) throw new AppError(code, message);
}
