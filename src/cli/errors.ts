/**
 * CLI error types and helpers.
 *
 * Provides structured error handling for CLI commands
 * with distinct exit codes for different failure modes.
 */

// ---------------------------------------------------------------------------
// Exit codes
// ---------------------------------------------------------------------------

export const EXIT_OK = 0;
export const EXIT_USAGE = 1;
export const EXIT_INPUT = 2;
export const EXIT_RUNTIME = 3;

// ---------------------------------------------------------------------------
// CLI error class
// ---------------------------------------------------------------------------

/**
 * An error with an associated process exit code.
 * Thrown by CLI commands; caught by the top-level runner.
 */
export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = EXIT_RUNTIME,
  ) {
    super(message);
    this.name = "CliError";
  }
}

/**
 * Create a usage error (wrong flags / missing arguments).
 */
export function usageError(message: string): CliError {
  return new CliError(message, EXIT_USAGE);
}

/**
 * Create an input error (file not found / invalid ID).
 */
export function inputError(message: string): CliError {
  return new CliError(message, EXIT_INPUT);
}
