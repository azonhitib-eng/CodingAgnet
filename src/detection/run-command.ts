/**
 * Safe command execution utility for host detection.
 *
 * Runs shell commands and captures stdout/stderr without throwing on
 * non-zero exit codes.  Detection code needs to distinguish "command
 * not found" from "command succeeded but output is unexpected", so we
 * return a structured result instead of throwing.
 *
 * Design rules:
 * - No side-effects beyond running the command
 * - No network calls (all commands are local inspection)
 * - Configurable timeout to avoid hanging on misbehaving binaries
 */

import { execFile } from "node:child_process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of running a local command. */
export interface CommandResult {
  /** Combined stdout (trimmed). */
  stdout: string;
  /** Combined stderr (trimmed). */
  stderr: string;
  /** Process exit code, or null if killed / timed out. */
  exitCode: number | null;
  /** True when the command was found and ran (exit code is not null). */
  ok: boolean;
}

export interface RunCommandOptions {
  /** Timeout in milliseconds (default 5 000). */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Default implementation
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Run a command, returning a structured result.
 * Never throws — errors are captured in the result.
 */
export async function runCommand(
  command: string,
  args: string[] = [],
  options: RunCommandOptions = {},
): Promise<CommandResult> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<CommandResult>((resolve) => {
    try {
      const child = execFile(
        command,
        args,
        { timeout, maxBuffer: 1024 * 512, shell: false },
        (error, stdout, stderr) => {
          if (error && "code" in error && error.code === "ENOENT") {
            // Command not found
            resolve({
              stdout: "",
              stderr: `command not found: ${command}`,
              exitCode: null,
              ok: false,
            });
            return;
          }
          // Command ran (possibly with non-zero exit)
          const exitCode =
            error && "code" in error && typeof error.code === "number"
              ? error.code
              : child.exitCode;
          resolve({
            stdout: (stdout ?? "").trim(),
            stderr: (stderr ?? "").trim(),
            exitCode: exitCode ?? (error ? 1 : 0),
            ok: !error,
          });
        },
      );
    } catch {
      // Truly unexpected — treat as command-not-found
      resolve({
        stdout: "",
        stderr: `failed to execute: ${command}`,
        exitCode: null,
        ok: false,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Dependency-injectable interface
// ---------------------------------------------------------------------------

/**
 * A function that runs a command and returns a result.
 * Production code uses the real `runCommand`; tests inject a mock.
 */
export type CommandRunner = (
  command: string,
  args?: string[],
  options?: RunCommandOptions,
) => Promise<CommandResult>;
