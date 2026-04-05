/**
 * Catalog error types.
 *
 * All catalog operations surface structured, human-readable errors.
 * Every error carries a `code` for programmatic handling and a
 * `message` for human consumption.
 */

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export type CatalogErrorCode =
  | "SCHEMA_VERSION_UNSUPPORTED"
  | "MANIFEST_PARSE_ERROR"
  | "MANIFEST_VALIDATION_ERROR"
  | "DUPLICATE_ID"
  | "REFERENCE_INTEGRITY_ERROR"
  | "NOT_FOUND"
  | "FILE_READ_ERROR";

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class CatalogError extends Error {
  readonly code: CatalogErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: CatalogErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
    this.details = details;
  }
}
