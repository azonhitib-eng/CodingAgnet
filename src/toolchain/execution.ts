/**
 * Minimal explicit execution support for safe toolchain checks.
 *
 * Provides a narrow, explicit execution path for developer-facing checks.
 * No background queue, no autonomous retries, no install behavior.
 *
 * Phase 39: Profile-aware toolchain adapter layer and workspace checks.
 */

import type {
  ToolchainCommandDefinition,
  ToolchainCheckResult,
  ToolchainCheckResultSummary,
  ToolchainCheckStatus,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  Execution interface (dependency injection)                        */
/* ------------------------------------------------------------------ */

/**
 * Interface for running a shell command.
 * Injected to keep this module testable without real subprocesses.
 */
export interface ShellRunner {
  /**
   * Run a command in a given working directory.
   * Returns exit code, stdout, and stderr.
   */
  run(
    command: string,
    cwd: string,
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Single check execution                                            */
/* ------------------------------------------------------------------ */

/** Maximum output summary length (bytes). */
const MAX_SUMMARY_LENGTH = 2000;

/** Truncate output to a reasonable summary length. */
function truncate(text: string, maxLen: number = MAX_SUMMARY_LENGTH): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + `\n... [truncated, ${text.length} chars total]`;
}

/**
 * Execute a single toolchain check explicitly.
 *
 * This is an explicit, developer-triggered action — not background or automatic.
 */
export async function executeCheck(
  command: ToolchainCommandDefinition,
  cwd: string,
  runner: ShellRunner,
): Promise<ToolchainCheckResult> {
  const startTime = Date.now();

  try {
    const { exitCode, stdout, stderr } = await runner.run(command.command, cwd);
    const durationMs = Date.now() - startTime;
    const status: ToolchainCheckStatus = exitCode === 0 ? "passed" : "failed";

    return {
      commandType: command.type,
      label: command.label,
      commandRun: command.command,
      status,
      exitCode,
      durationMs,
      stdoutSummary: truncate(stdout),
      stderrSummary: truncate(stderr),
      executedAt: new Date().toISOString(),
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);

    return {
      commandType: command.type,
      label: command.label,
      commandRun: command.command,
      status: "error",
      exitCode: null,
      durationMs,
      stdoutSummary: "",
      stderrSummary: truncate(message),
      executedAt: new Date().toISOString(),
    };
  }
}

/**
 * Execute multiple checks sequentially and build a result summary.
 *
 * Explicit invocation only — no parallelism, no retries.
 */
export async function executeChecks(
  commands: readonly ToolchainCommandDefinition[],
  cwd: string,
  runner: ShellRunner,
): Promise<ToolchainCheckResultSummary> {
  const results: ToolchainCheckResult[] = [];

  for (const cmd of commands) {
    const result = await executeCheck(cmd, cwd, runner);
    results.push(result);
  }

  return buildCheckResultSummary(results);
}

/**
 * Build a check result summary from individual results.
 */
export function buildCheckResultSummary(
  results: readonly ToolchainCheckResult[],
): ToolchainCheckResultSummary {
  return {
    totalRun: results.length,
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    errored: results.filter((r) => r.status === "error").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
    completedAt: new Date().toISOString(),
  };
}
