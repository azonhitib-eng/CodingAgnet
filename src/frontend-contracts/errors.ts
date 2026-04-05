/**
 * Normalized frontend-facing error contract.
 *
 * Provides a stable, presentation-friendly error shape without
 * replacing internal backend error classes.
 */

export type FrontendErrorCode =
  | "INVALID_INPUT"
  | "MISSING_ARTIFACT"
  | "MISSING_RUNTIME"
  | "BLOCKED_BY_POLICY"
  | "INTERNAL_FAILURE";

export interface FrontendError {
  /** Stable machine-readable code. */
  code: FrontendErrorCode;
  /** Human-readable summary suitable for display. */
  message: string;
  /** Additional structured detail (varies per code). */
  details: Record<string, unknown> | null;
}

/**
 * Create a normalized frontend error.
 */
export function createFrontendError(
  code: FrontendErrorCode,
  message: string,
  details?: Record<string, unknown>,
): FrontendError {
  return { code, message, details: details ?? null };
}

/**
 * Classify a backend Error (or WorkflowResult error string) into a
 * normalized frontend error.
 *
 * The heuristic matches common backend error messages to stable codes.
 * Unrecognized errors map to `INTERNAL_FAILURE`.
 */
export function normalizeFrontendError(
  error: Error | string,
): FrontendError {
  const msg = typeof error === "string" ? error : error.message;
  const lower = msg.toLowerCase();

  if (
    lower.includes("no compatible artifact") ||
    lower.includes("no recommendations") ||
    lower.includes("artifact") && lower.includes("not found")
  ) {
    return createFrontendError("MISSING_ARTIFACT", msg, {
      originalMessage: msg,
    });
  }

  if (
    lower.includes("runtime") && lower.includes("not") ||
    lower.includes("missing runtime") ||
    lower.includes("runtime_missing")
  ) {
    return createFrontendError("MISSING_RUNTIME", msg, {
      originalMessage: msg,
    });
  }

  if (
    lower.includes("blocked") ||
    lower.includes("policy") && lower.includes("violation")
  ) {
    return createFrontendError("BLOCKED_BY_POLICY", msg, {
      originalMessage: msg,
    });
  }

  if (
    lower.includes("invalid") ||
    lower.includes("validation") ||
    lower.includes("parse")
  ) {
    return createFrontendError("INVALID_INPUT", msg, {
      originalMessage: msg,
    });
  }

  return createFrontendError("INTERNAL_FAILURE", msg, {
    originalMessage: msg,
  });
}
