/**
 * Catalog error types.
 *
 * All catalog operations surface structured, human-readable errors.
 * Every error carries a `code` for programmatic handling, a `message`
 * for human consumption, and optional context fields (`filePath`,
 * `manifestType`, `entityId`) to help pinpoint the failure.
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
// Manifest type labels (used in error context)
// ---------------------------------------------------------------------------

export type ManifestType = "model" | "runtime" | "agent-tool";

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class CatalogError extends Error {
  readonly code: CatalogErrorCode;
  /** File that triggered the error, if known. */
  readonly filePath?: string;
  /** The kind of manifest involved, if known. */
  readonly manifestType?: ManifestType;
  /** The entity id involved, if known. */
  readonly entityId?: string;
  /** Arbitrary extra details. */
  readonly details?: Record<string, unknown>;

  constructor(
    code: CatalogErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
    this.filePath = details?.filePath as string | undefined;
    this.manifestType = details?.manifestType as ManifestType | undefined;
    this.entityId = details?.entityId as string | undefined;
    this.details = details;
  }
}
