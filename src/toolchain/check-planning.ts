/**
 * Workspace check planning.
 *
 * Determines which toolchain checks are available, recommended, or unavailable
 * for a workspace, based on the repo fingerprint, selected profile, and
 * workspace file signals.
 *
 * Phase 39: Profile-aware toolchain adapter layer and workspace checks.
 */

import type { LanguageProfileId } from "../fingerprint/types.js";
import type { RepoFingerprint, ProfileSelection } from "../fingerprint/types.js";
import type {
  ToolchainCommandDefinition,
  ToolchainAvailability,
  ToolchainAvailabilityStatus,
  WorkspaceToolchainSummary,
} from "./types.js";
import { buildAdapterId, mapProfileToCommands, resolveToolchainKind } from "./mapping.js";

/* ------------------------------------------------------------------ */
/*  Availability assessment                                           */
/* ------------------------------------------------------------------ */

/**
 * Assess availability of a single toolchain command.
 *
 * Uses file-level evidence and optional host signals to determine whether
 * the tool is expected to be runnable.
 */
export function assessCommandAvailability(
  command: ToolchainCommandDefinition,
  fileSet: ReadonlySet<string>,
  hostToolsAvailable?: readonly string[],
): ToolchainAvailability {
  // If we have host-level tool availability information, use it
  if (hostToolsAvailable) {
    const toolAvailable = hostToolsAvailable.includes(command.tool);
    if (toolAvailable) {
      return {
        command,
        status: "available",
        reason: `Tool "${command.tool}" confirmed available on host.`,
        recommended: command.priority === "recommended",
      };
    }
    // Tool is not on host — but it might still be locally available via node_modules/vendor
    if (command.expectedLocal) {
      return {
        command,
        status: "likely_available",
        reason: `Tool "${command.tool}" not confirmed on host but expected locally (node_modules/vendor).`,
        recommended: command.priority === "recommended",
      };
    }
    return {
      command,
      status: "unavailable",
      reason: `Tool "${command.tool}" not found on host and not expected locally.`,
      recommended: false,
    };
  }

  // No host-level info — assess from file evidence alone
  if (command.expectedLocal) {
    // Local tools (node_modules/vendor) — likely available if project files exist
    const hasEvidence = command.evidence.some((e) => fileSet.has(e) || e.includes("directory"));
    if (hasEvidence) {
      return {
        command,
        status: "likely_available",
        reason: `Tool "${command.tool}" expected locally based on project config.`,
        recommended: command.priority === "recommended",
      };
    }
    return {
      command,
      status: "unknown",
      reason: `Tool "${command.tool}" expected locally but evidence files not confirmed.`,
      recommended: false,
    };
  }

  // System-level tools (cargo, go, python, etc.) — unknown without host detection
  return {
    command,
    status: "unknown",
    reason: `Tool "${command.tool}" requires system installation; run host detection for confirmation.`,
    recommended: command.priority === "recommended",
  };
}

/* ------------------------------------------------------------------ */
/*  Full workspace check planning                                     */
/* ------------------------------------------------------------------ */

/**
 * Build a complete workspace toolchain summary.
 *
 * This is the main entry point for workspace check planning.
 * It answers: which checks are available, recommended, unavailable, and why.
 */
export function buildWorkspaceToolchainSummary(
  profileId: LanguageProfileId,
  files: readonly string[],
  options?: {
    readonly hostToolsAvailable?: readonly string[];
  },
): WorkspaceToolchainSummary {
  const adapterId = buildAdapterId(profileId);
  const toolchainKind = resolveToolchainKind(profileId, files);
  const commands = mapProfileToCommands(profileId, files);

  const normalizedFiles = new Set(
    files.map((f) => f.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "")),
  );

  const availability = commands.map((cmd) =>
    assessCommandAvailability(cmd, normalizedFiles, options?.hostToolsAvailable),
  );

  const recommended = availability
    .filter((a) => a.recommended && a.status !== "unavailable")
    .map((a) => a.command);

  const optional = availability
    .filter(
      (a) =>
        !a.recommended &&
        a.status !== "unavailable",
    )
    .map((a) => a.command);

  const unavailable = availability
    .filter((a) => a.status === "unavailable")
    .map((a) => a.command);

  const notes = buildSummaryNotes(profileId, commands, availability);

  return {
    adapterId,
    profileId,
    toolchainKind,
    commands,
    availability,
    recommended,
    optional,
    unavailable,
    notes,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Build summary from fingerprint and profile selection (convenience).
 */
export function buildToolchainSummaryFromFingerprint(
  fingerprint: RepoFingerprint,
  selection: ProfileSelection,
  files: readonly string[],
  options?: {
    readonly hostToolsAvailable?: readonly string[];
  },
): WorkspaceToolchainSummary {
  return buildWorkspaceToolchainSummary(
    selection.primary.id,
    files,
    options,
  );
}

/* ------------------------------------------------------------------ */
/*  Summary notes builder                                             */
/* ------------------------------------------------------------------ */

function buildSummaryNotes(
  profileId: LanguageProfileId,
  commands: readonly ToolchainCommandDefinition[],
  availability: readonly ToolchainAvailability[],
): string[] {
  const notes: string[] = [];

  if (commands.length === 0) {
    notes.push(`No toolchain commands mapped for profile "${profileId}".`);
    return notes;
  }

  const recommendedCount = availability.filter((a) => a.recommended).length;
  const unavailableCount = availability.filter((a) => a.status === "unavailable").length;
  const unknownCount = availability.filter((a) => a.status === "unknown").length;

  notes.push(`${commands.length} toolchain command(s) mapped for profile "${profileId}".`);

  if (recommendedCount > 0) {
    notes.push(`${recommendedCount} check(s) recommended.`);
  }

  if (unavailableCount > 0) {
    notes.push(
      `${unavailableCount} check(s) unavailable — required tools not found.`,
    );
  }

  if (unknownCount > 0) {
    notes.push(
      `${unknownCount} check(s) have unknown availability — run host detection for confirmation.`,
    );
  }

  return notes;
}
