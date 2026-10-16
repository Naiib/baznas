const STATUS_BY_CODE = Object.freeze({
  FIELD_FORBIDDEN: 422,
  FIELD_INVALID: 422,
  VALIDATION_FAILED: 422,
  MONEY_FORMAT: 422,
  MONEY_SCALE: 422,
  MONEY_NON_NEGATIVE: 422,
  FIELD_ENCRYPTION_UNAVAILABLE: 503,
  FIELD_ENCRYPTION_FAILED: 422,
  ADMIN_ROUTINE_FORBIDDEN: 403,
  ACTOR_SEPARATION: 403,
  ROLE_REQUIRED: 403,
  LEVEL_REQUIRED: 403,
  DIVISION_REQUIRED: 403,
  PERMISSION_DENIED: 403,
  STALE_ARTIFACT: 409,
  MONEY_RANGE: 422,
  FIELD_ENCRYPTION_INPUT_INVALID: 422,
  CANONICAL_UNDEFINED: 422,
  CANONICAL_NON_FINITE: 422,
  CANONICAL_FUNCTION: 422,
  CANONICAL_PROTOTYPE: 422,
  CANONICAL_DUPLICATE_KEY: 422,
  CANONICAL_UNDECLARED: 422,
  CANONICAL_SYMBOL: 422,
  CANONICAL_LOCAL_TIME: 422,
  CANONICAL_DATE_INVALID: 422,
  CANONICAL_INTEGER_INVALID: 422,
  CANONICAL_MONEY_INVALID: 422,
  CANONICAL_NESTED_INVALID: 422,
  CANONICAL_ARTIFACT_UNKNOWN: 422,
  CANONICAL_INPUT_INVALID: 422,
  ACTOR_REQUIRED: 401,
  RECOVERY_REASON_REQUIRED: 422,
  RECOVERY_REVISION_REQUIRED: 422,
  RECOVERY_HASH_REQUIRED: 422,
  RECOVERY_BYPASS_FORBIDDEN: 403,
  CASE_NOT_FOUND: 404,
  ARTIFACT_NOT_FOUND: 404,
  ASSESSMENT_NOT_FOUND: 404,
  IDEMPOTENCY_KEY_REUSED: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
  IDEMPOTENCY_RACE: 409,
  ACTIVE_REVISION_EXISTS: 409,
  WRONG_STATE: 409,
  STALE_STATE: 409,
  EXPECTED_GUARD_INVALID: 422,
  FIELD_INVALID: 422,
  HARD_DELETE_DISABLED: 405,
  LEGACY_WORKFLOW_DISABLED: 410,
  P0_WORKFLOW_DISABLED: 503,
  ALREADY_ARCHIVED: 409,
  NOT_ARCHIVED: 409,
  TERMINAL_CASE_IMMUTABLE: 409,
});

/**
 * Stable, serialisable error used by the P0 domain and its future HTTP
 * adapters.  Domain code never needs to know about Express response objects.
 */
export class P0Error extends Error {
  constructor(code, message, options = {}) {
    if (code && typeof code === 'object') {
      const input = code;
      code = input.code;
      message = input.message;
      options = input;
    }
    const normalizedCode = String(code || 'P0_ERROR');
    super(`${normalizedCode}: ${String(message || normalizedCode)}`);
    this.name = 'P0Error';
    this.code = normalizedCode;
    this.status = Number.isInteger(options.status)
      ? options.status
      : (STATUS_BY_CODE[normalizedCode] || 400);
    this.field_errors = options.field_errors && typeof options.field_errors === 'object'
      ? Object.freeze({ ...options.field_errors })
      : undefined;
    this.details = options.details === undefined ? undefined : options.details;
    this.cause = options.cause;
    if (Error.captureStackTrace) Error.captureStackTrace(this, P0Error);
  }

  toJSON() {
    const body = {
      success: false,
      code: this.code,
      message: this.message,
    };
    if (this.field_errors && Object.keys(this.field_errors).length) {
      body.field_errors = { ...this.field_errors };
    }
    if (this.details !== undefined) body.details = this.details;
    return body;
  }
}

export function p0FieldError(field, code, message = code) {
  return new P0Error('VALIDATION_FAILED', message, {
    status: 422,
    field_errors: { [field]: code },
  });
}

export const P0_ERROR_STATUS = STATUS_BY_CODE;
