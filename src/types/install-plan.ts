/**
 * Install plan type contracts.
 *
 * An install plan describes what would need to happen to make a model
 * artifact usable on a host.  Plans are informational — the backend
 * NEVER auto-executes them.
 */

import type { Platform } from "./runtime.js";

// ---------------------------------------------------------------------------
// Enums / literals
// ---------------------------------------------------------------------------

export type RiskLevel = "safe" | "caution" | "dangerous" | "blocked";

// ---------------------------------------------------------------------------
// Plan steps
// ---------------------------------------------------------------------------

export interface InstallStep {
  order: number;
  /** Shell command to execute. */
  command: string;
  description: string;
  riskLevel: RiskLevel;
  /** Whether this step requires explicit human approval. */
  requiresApproval: boolean;
  /** Whether the effect is reversible (e.g. `pip install` vs `rm -rf`). */
  reversible: boolean;
  /** Applicable platform(s); absent means all. */
  platforms?: Platform[];
  /** Estimated wall-clock seconds (rough). */
  estimatedDurationSec?: number;
}

/** Prerequisites that must be satisfied before the plan can run. */
export interface Prerequisite {
  name: string;
  checkCommand: string;
  installHint: string;
}

/** Resource impact of executing the full plan. */
export interface ResourceEstimate {
  diskSpaceGb: number;
  peakRamGb?: number;
  requiresNetwork: boolean;
  estimatedDownloadGb?: number;
}

/** Post-install verification step. */
export interface VerificationStep {
  command: string;
  expectedOutput?: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Full plan
// ---------------------------------------------------------------------------

export interface InstallPlan {
  /** Model artifact this plan installs. */
  artifactId: string;
  /** Runtime this plan targets. */
  runtimeId: string;
  /** Target platform for platform-specific plans. */
  targetPlatform: Platform;
  prerequisites: Prerequisite[];
  steps: InstallStep[];
  postInstallVerification: VerificationStep[];
  resourceEstimate: ResourceEstimate;
  /** Risk notes for the plan as a whole. */
  risks: string[];
  /** Human-readable summary. */
  humanSummary: string;
}
