/**
 * Diagnostics planning / availability layer.
 *
 * Phase 40: Answers the key questions:
 * - What language-service support is expected for this workspace?
 * - What diagnostics are available vs unavailable?
 * - Why is the service unavailable?
 * - What profile evidence justifies the mapping?
 *
 * Honest and typed.  No magic.
 */

import type { LanguageProfileId } from "../fingerprint/types.js";
import type {
  LanguageServiceAvailability,
  LanguageServiceStatus,
  LanguageServiceUnavailableReason,
} from "./types.js";
import {
  mapProfileToServiceKind,
  buildContextHint,
  hasConfigEvidence,
  getDiagnosticsCommandHints,
} from "./mapping.js";

/* ------------------------------------------------------------------ */
/*  Availability assessment                                            */
/* ------------------------------------------------------------------ */

/**
 * Assess language-service availability for a workspace.
 *
 * @param profileId    — selected language profile
 * @param files        — list of workspace file paths (relative)
 * @param toolsOnPath  — optional list of tool names detected on PATH
 *
 * The assessment is deterministic given the same inputs.
 */
export function assessLanguageServiceAvailability(
  profileId: LanguageProfileId,
  files: readonly string[],
  toolsOnPath?: readonly string[],
): LanguageServiceAvailability {
  const now = new Date().toISOString();
  const serviceKind = mapProfileToServiceKind(profileId);
  const contextHint = buildContextHint(serviceKind);

  // 1. No service for this profile
  if (serviceKind === "none") {
    const reason: LanguageServiceUnavailableReason =
      profileId === "generic-unknown" ? "generic_profile" : "service_not_applicable";
    return {
      profileId,
      serviceKind,
      status: "unavailable",
      unavailableReason: reason,
      explanation:
        profileId === "generic-unknown"
          ? "No language profile was selected (generic/unknown). Diagnostics are not available."
          : `Profile "${profileId}" does not map to a known language service.`,
      evidence: [],
      contextHint,
      assessedAt: now,
    };
  }

  // 2. Check config evidence
  const hasConfig = hasConfigEvidence(serviceKind, files);
  const evidence: string[] = [];

  if (hasConfig) {
    evidence.push(`Config files detected for ${serviceKind} workspace`);
  } else {
    evidence.push(`No ${serviceKind} config files detected`);
  }

  // 3. Check tool availability
  const commandHints = getDiagnosticsCommandHints(serviceKind);
  const toolNames = commandHints.map((h) => h.tool);
  const detectedTools = toolsOnPath
    ? toolNames.filter((t) => toolsOnPath.includes(t))
    : [];

  if (toolsOnPath) {
    if (detectedTools.length > 0) {
      evidence.push(`Tools on PATH: ${detectedTools.join(", ")}`);
    } else {
      evidence.push(`Expected tools not found on PATH: ${toolNames.join(", ")}`);
    }
  } else {
    evidence.push("Tool PATH detection not performed");
  }

  // 4. Determine status
  let status: LanguageServiceStatus;
  let unavailableReason: LanguageServiceUnavailableReason | null = null;
  let explanation: string;

  if (toolsOnPath && detectedTools.length > 0 && hasConfig) {
    status = "available";
    explanation =
      `Language service "${serviceKind}" is available: ` +
      `tools (${detectedTools.join(", ")}) detected and workspace is configured.`;
  } else if (hasConfig && !toolsOnPath) {
    // Config found but no tool check — likely available
    status = "likely_available";
    explanation =
      `Language service "${serviceKind}" is likely available: ` +
      `workspace config detected but tool availability was not checked.`;
  } else if (hasConfig && toolsOnPath && detectedTools.length === 0) {
    // Config found but tools missing
    status = "unavailable";
    unavailableReason = "service_binary_not_found";
    explanation =
      `Language service "${serviceKind}" is unavailable: ` +
      `workspace is configured but required tools (${toolNames.join(", ")}) were not found on PATH.`;
  } else if (!hasConfig && toolsOnPath && detectedTools.length > 0) {
    // Tools exist but no config
    status = "not_configured";
    unavailableReason = "workspace_not_configured";
    explanation =
      `Language service "${serviceKind}" tools detected (${detectedTools.join(", ")}), ` +
      `but workspace lacks configuration files. Diagnostics may not work correctly.`;
  } else if (!hasConfig && !toolsOnPath) {
    // No config, no tool check
    status = "unknown";
    unavailableReason = "unknown";
    explanation =
      `Language service "${serviceKind}" status unknown: ` +
      `no config files detected and tool availability was not checked.`;
  } else {
    // No config, no tools
    status = "unavailable";
    unavailableReason = "service_binary_not_found";
    explanation =
      `Language service "${serviceKind}" is unavailable: ` +
      `no config files and no tools detected.`;
  }

  return {
    profileId,
    serviceKind,
    status,
    unavailableReason,
    explanation,
    evidence,
    contextHint,
    assessedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Quick check: does this profile have any language-service support?
 */
export function hasLanguageServiceSupport(profileId: LanguageProfileId): boolean {
  return mapProfileToServiceKind(profileId) !== "none";
}

/**
 * Get a short human-readable label for the service.
 */
export function getServiceLabel(profileId: LanguageProfileId): string {
  const kind = mapProfileToServiceKind(profileId);
  switch (kind) {
    case "typescript":  return "TypeScript Language Service";
    case "javascript":  return "JavaScript Language Service";
    case "python":      return "Python Language Service";
    case "php":         return "PHP Language Service";
    case "rust":        return "Rust Language Service";
    case "go":          return "Go Language Service";
    case "none":        return "No Language Service";
  }
}
