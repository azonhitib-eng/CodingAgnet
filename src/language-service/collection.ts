/**
 * Minimal explicit diagnostics collection.
 *
 * Phase 40: The smallest practical explicit path to collect diagnostics
 * for a workspace.  Uses existing toolchain command patterns as a
 * diagnostics source.
 *
 * Constraints:
 * - Explicit run only — no background watcher
 * - No persistent LSP daemon
 * - No editor embedding
 * - Uses ShellRunner DI (same as toolchain execution)
 */

import type { LanguageProfileId } from "../fingerprint/types.js";
import type {
  FileDiagnostic,
  DiagnosticSeverity,
  WorkspaceDiagnosticSummary,
  LanguageServiceResultSummary,
} from "./types.js";
import {
  mapProfileToServiceKind,
  getDiagnosticsCommandHints,
} from "./mapping.js";
import { assessLanguageServiceAvailability } from "./availability.js";

/* ------------------------------------------------------------------ */
/*  Shell runner interface (same as toolchain)                         */
/* ------------------------------------------------------------------ */

/**
 * Minimal shell runner interface for diagnostics collection.
 * Same shape as toolchain's ShellRunner for consistency.
 */
export interface DiagnosticsShellRunner {
  run(command: string, cwd: string): Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Output parsing                                                     */
/* ------------------------------------------------------------------ */

/**
 * Parse raw command output into structured diagnostics.
 *
 * This is a best-effort parser that handles common output formats:
 * - "file:line:col: severity: message" (tsc, mypy, gcc-style)
 * - Simple line-based messages
 *
 * It does NOT parse JSON output from eslint/cargo/phpstan. That would
 * require per-tool parsers which is beyond the minimal Phase 40 scope.
 */
export function parseSimpleDiagnostics(
  output: string,
  source: string,
): FileDiagnostic[] {
  const diagnostics: FileDiagnostic[] = [];
  const lines = output.split("\n").filter((l) => l.trim().length > 0);

  // Pattern: file(line,col): severity TS1234: message (tsc)
  const tscPattern = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/;
  // Pattern: file:line:col: error/warning: message (generic)
  const genericPattern = /^(.+?):(\d+):(\d+):\s*(error|warning|note|hint|info|information):\s*(.+)$/;
  // Pattern: file:line: error/warning: message (no column)
  const noColPattern = /^(.+?):(\d+):\s*(error|warning|note|hint|info|information):\s*(.+)$/;

  for (const line of lines) {
    let match = tscPattern.exec(line);
    if (match) {
      diagnostics.push({
        file: match[1].trim(),
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        severity: normalizeSeverity(match[4]),
        message: match[6].trim(),
        source,
        code: match[5],
      });
      continue;
    }

    match = genericPattern.exec(line);
    if (match) {
      diagnostics.push({
        file: match[1].trim(),
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        severity: normalizeSeverity(match[4]),
        message: match[5].trim(),
        source,
      });
      continue;
    }

    match = noColPattern.exec(line);
    if (match) {
      diagnostics.push({
        file: match[1].trim(),
        line: parseInt(match[2], 10),
        column: 0,
        severity: normalizeSeverity(match[3]),
        message: match[4].trim(),
        source,
      });
    }
  }

  return diagnostics;
}

/** Normalize severity string to DiagnosticSeverity. */
function normalizeSeverity(raw: string): DiagnosticSeverity {
  const lower = raw.toLowerCase();
  if (lower === "error") return "error";
  if (lower === "warning") return "warning";
  if (lower === "info" || lower === "information") return "information";
  if (lower === "hint" || lower === "note") return "hint";
  return "warning"; // fallback
}

/* ------------------------------------------------------------------ */
/*  Summary builder                                                    */
/* ------------------------------------------------------------------ */

/** Build a diagnostics summary from collected diagnostics. */
export function buildDiagnosticsSummary(
  profileId: LanguageProfileId,
  diagnostics: readonly FileDiagnostic[],
  collected: boolean,
): WorkspaceDiagnosticSummary {
  const serviceKind = mapProfileToServiceKind(profileId);
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.filter((d) => d.severity === "warning").length;
  const informationCount = diagnostics.filter((d) => d.severity === "information").length;
  const hintCount = diagnostics.filter((d) => d.severity === "hint").length;
  const filesAffected = new Set(diagnostics.map((d) => d.file)).size;

  // Sample up to 5 messages
  const sampleMessages = diagnostics
    .slice(0, 5)
    .map((d) => `${d.file}:${d.line}: [${d.severity}] ${d.message}`);

  return {
    profileId,
    serviceKind,
    collected,
    errorCount,
    warningCount,
    informationCount,
    hintCount,
    totalCount: diagnostics.length,
    filesAffected,
    sampleMessages,
    diagnostics,
    generatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  Explicit diagnostics collection                                    */
/* ------------------------------------------------------------------ */

/**
 * Collect diagnostics for a workspace by running the first available
 * diagnostics command.
 *
 * This is an explicit, one-shot operation.  It:
 * 1. Assesses availability
 * 2. If a command is available, runs it
 * 3. Parses the output
 * 4. Returns a full result summary
 *
 * If no command is available or the service is unavailable, it returns
 * an honest result with no diagnostics.
 */
export async function collectDiagnostics(
  profileId: LanguageProfileId,
  workspacePath: string,
  files: readonly string[],
  runner: DiagnosticsShellRunner,
  toolsOnPath?: readonly string[],
): Promise<LanguageServiceResultSummary> {
  const availability = assessLanguageServiceAvailability(profileId, files, toolsOnPath);

  // If unavailable, don't attempt collection
  if (availability.status === "unavailable") {
    return {
      availability,
      diagnosticsSummary: buildDiagnosticsSummary(profileId, [], false),
      collectionAttempted: false,
      collectionError: null,
    };
  }

  // Get command hints
  const serviceKind = mapProfileToServiceKind(profileId);
  const hints = getDiagnosticsCommandHints(serviceKind);

  if (hints.length === 0) {
    return {
      availability,
      diagnosticsSummary: buildDiagnosticsSummary(profileId, [], false),
      collectionAttempted: false,
      collectionError: null,
    };
  }

  // Run the first available command
  const hint = hints[0];

  try {
    const result = await runner.run(hint.command, workspacePath);

    // Diagnostics commands often exit non-zero when they find issues.
    // That's expected, not an error.
    const output = (result.stdout || "") + "\n" + (result.stderr || "");
    const diagnostics = parseSimpleDiagnostics(output, hint.tool);
    const summary = buildDiagnosticsSummary(profileId, diagnostics, true);

    return {
      availability,
      diagnosticsSummary: summary,
      collectionAttempted: true,
      collectionError: null,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      availability,
      diagnosticsSummary: buildDiagnosticsSummary(profileId, [], false),
      collectionAttempted: true,
      collectionError: `Diagnostics collection failed: ${errorMsg}`,
    };
  }
}
