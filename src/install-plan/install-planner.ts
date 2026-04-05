/**
 * Install planner.
 *
 * Produces a deterministic, reviewable InstallPlan given a host profile,
 * catalog context, and target artifact.  The planner NEVER executes
 * commands — it only describes what would need to happen.
 *
 * Design constraints:
 *   - platform-aware and runtime-aware
 *   - reflects host uncertainty via warnings
 *   - marks GPU layer estimates as approximate / low-confidence
 *   - does not claim disk bottleneck without detected evidence
 *   - deterministic for identical inputs
 */

import type {
  HostProfile,
  ModelArtifact,
  ModelVariant,
  RuntimeEntry,
  Platform,
  InstallPlan,
  InstallStep,
  Prerequisite,
  ResourceEstimate,
  VerificationStep,
  RiskLevel,
  CompatibilityResult,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Public input contract
// ---------------------------------------------------------------------------

/** Everything the planner needs to produce an InstallPlan. */
export interface PlannerInput {
  host: HostProfile;
  artifact: ModelArtifact;
  variant: ModelVariant;
  runtime: RuntimeEntry;
  /** Pre-computed compatibility result (optional — enriches warnings). */
  compatibility?: CompatibilityResult;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic InstallPlan for the given inputs.
 *
 * The plan is informational — it should be reviewed by a human and
 * optionally evaluated by the safety layer before any execution.
 */
export function generateInstallPlan(input: PlannerInput): InstallPlan {
  const { host, artifact, variant, runtime } = input;
  const targetPlatform = resolveTargetPlatform(host, runtime);

  const prerequisites = buildPrerequisites(runtime, targetPlatform);
  const steps = buildSteps(artifact, runtime, targetPlatform);
  const postInstallVerification = buildVerification(artifact, runtime, targetPlatform);
  const resourceEstimate = buildResourceEstimate(artifact);
  const risks = buildRisks(input, targetPlatform);
  const humanSummary = buildSummary(artifact, variant, runtime, targetPlatform, risks);

  return {
    artifactId: artifact.id,
    runtimeId: runtime.id,
    targetPlatform,
    prerequisites,
    steps,
    postInstallVerification,
    resourceEstimate,
    risks,
    humanSummary,
  };
}

// ---------------------------------------------------------------------------
// Platform resolution
// ---------------------------------------------------------------------------

function resolveTargetPlatform(
  host: HostProfile,
  runtime: RuntimeEntry,
): Platform {
  const hostPlatform = host.os.platform.value as Platform | null;
  if (
    hostPlatform !== null &&
    runtime.supportedPlatforms.includes(hostPlatform)
  ) {
    return hostPlatform;
  }
  // Fallback: pick first supported platform from the runtime.
  return runtime.supportedPlatforms[0] ?? "linux";
}

// ---------------------------------------------------------------------------
// Prerequisites
// ---------------------------------------------------------------------------

function buildPrerequisites(
  runtime: RuntimeEntry,
  platform: Platform,
): Prerequisite[] {
  const prereqs: Prerequisite[] = [];

  // Runtime detection prerequisite
  prereqs.push({
    name: runtime.displayName,
    checkCommand: runtime.detectionCommand,
    installHint: runtimeInstallHint(runtime, platform),
  });

  // Driver requirements
  if (runtime.requiredDrivers) {
    for (const driver of runtime.requiredDrivers) {
      prereqs.push({
        name: driver,
        checkCommand: driverCheckCommand(driver),
        installHint: `Install or update: ${driver}`,
      });
    }
  }

  return prereqs;
}

function runtimeInstallHint(runtime: RuntimeEntry, platform: Platform): string {
  const instructions = runtime.installInstructions[platform];
  if (instructions && instructions.length > 0) {
    return instructions.join(" && ");
  }
  return `Install ${runtime.displayName} for ${platform} (see official documentation)`;
}

function driverCheckCommand(driver: string): string {
  const lower = driver.toLowerCase();
  if (lower.includes("cuda")) return "nvidia-smi";
  if (lower.includes("rocm")) return "rocminfo";
  return `which ${driver.split(" ")[0].toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Install steps
// ---------------------------------------------------------------------------

function buildSteps(
  artifact: ModelArtifact,
  runtime: RuntimeEntry,
  platform: Platform,
): InstallStep[] {
  const steps: InstallStep[] = [];
  let order = 0;

  // Step 1: Install runtime if not present (platform-specific)
  const installInstructions = runtime.installInstructions[platform];
  if (installInstructions && installInstructions.length > 0) {
    for (const cmd of installInstructions) {
      steps.push({
        order: order++,
        command: cmd,
        description: `Install ${runtime.displayName} on ${platform}`,
        riskLevel: classifyStepRisk(cmd),
        requiresApproval: true,
        reversible: true,
        platforms: [platform],
      });
    }
  }

  // Step 2: Pull / download model artifact
  const pullCmd = artifact.pullCommand ?? artifact.downloadUrl;
  if (pullCmd) {
    steps.push({
      order: order++,
      command: pullCmd,
      description: `Download model artifact "${artifact.id}"`,
      riskLevel: "safe",
      requiresApproval: false,
      reversible: true,
      platforms: [platform],
      estimatedDurationSec: estimateDownloadDuration(artifact),
    });
  }

  // Step 3: Start / verify runtime service (if local_server type)
  if (runtime.type === "local_server") {
    const startCmd = runtimeStartCommand(runtime, platform);
    steps.push({
      order: order++,
      command: startCmd,
      description: `Start ${runtime.displayName} service`,
      riskLevel: "safe",
      requiresApproval: false,
      reversible: true,
      platforms: [platform],
    });
  }

  return steps;
}

function classifyStepRisk(command: string): RiskLevel {
  const lower = command.toLowerCase();
  if (lower.includes("rm -rf") || lower.includes("format") || lower.includes("dd if=")) {
    return "dangerous";
  }
  if (lower.includes("sudo") || (lower.includes("curl") && lower.includes("| sh"))) {
    return "caution";
  }
  return "safe";
}

/** Assumed average download speed in MB/s for duration estimation. */
const ASSUMED_DOWNLOAD_SPEED_MB_S = 50;

function estimateDownloadDuration(artifact: ModelArtifact): number | undefined {
  if (artifact.fileSizeGb !== undefined && artifact.fileSizeGb > 0) {
    return Math.ceil(artifact.fileSizeGb * 1024 / ASSUMED_DOWNLOAD_SPEED_MB_S);
  }
  return undefined;
}

function runtimeStartCommand(runtime: RuntimeEntry, _platform: Platform): string {
  // Data-driven: use runtime id to produce known start commands.
  const startCommands: Record<string, string> = {
    ollama: "ollama serve",
    "llama-cpp": "llama-server",
    vllm: "vllm serve",
  };
  return startCommands[runtime.id] ?? `${runtime.id} serve`;
}

// ---------------------------------------------------------------------------
// Post-install verification
// ---------------------------------------------------------------------------

function buildVerification(
  artifact: ModelArtifact,
  runtime: RuntimeEntry,
  platform: Platform,
): VerificationStep[] {
  const steps: VerificationStep[] = [];

  // Verify runtime is accessible
  steps.push({
    command: runtime.versionCommand,
    description: `Verify ${runtime.displayName} is installed and responsive`,
  });

  // Platform-specific post-install verification from runtime manifest
  const platformVerification = runtime.postInstallVerification?.[platform];
  if (platformVerification) {
    for (const cmd of platformVerification) {
      steps.push({
        command: cmd,
        description: `Runtime post-install verification (${platform})`,
      });
    }
  }

  // Verify model artifact is available
  const listCommands: Record<string, string> = {
    ollama: `ollama list | grep ${artifact.id.split("-").slice(0, 2).join("-")}`,
    "llama-cpp": `ls -la ~/.cache/llama-cpp/ | grep ${artifact.id}`,
  };
  const listCmd = listCommands[runtime.id];
  if (listCmd) {
    steps.push({
      command: listCmd,
      description: `Verify model artifact "${artifact.id}" is available`,
    });
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Resource estimates
// ---------------------------------------------------------------------------

function buildResourceEstimate(artifact: ModelArtifact): ResourceEstimate {
  const diskSpaceGb = artifact.fileSizeGb ?? 0;
  const peakRamGb = artifact.recommendedRamGb;
  const requiresNetwork = !!(artifact.pullCommand || artifact.downloadUrl);

  return {
    diskSpaceGb,
    peakRamGb,
    requiresNetwork,
    estimatedDownloadGb: requiresNetwork ? diskSpaceGb : undefined,
  };
}

// ---------------------------------------------------------------------------
// Risk notes
// ---------------------------------------------------------------------------

function buildRisks(input: PlannerInput, platform: Platform): string[] {
  const { host, artifact, runtime, compatibility } = input;
  const risks: string[] = [];

  // Uncertain host data
  if (host.os.platform.confidence !== "certain") {
    risks.push(
      "WARNING: Host platform detection is uncertain — plan may target wrong platform.",
    );
  }
  if (host.memory.totalGb.confidence === "unknown") {
    risks.push(
      "WARNING: System RAM is unknown — cannot confirm memory requirements.",
    );
  }
  if (host.memory.totalGb.confidence === "estimated") {
    risks.push(
      "WARNING: System RAM is estimated — actual capacity may differ.",
    );
  }
  if (host.gpu !== null && host.gpu.vramGb.confidence === "unknown") {
    risks.push(
      "WARNING: GPU VRAM is unknown — GPU offload viability is uncertain.",
    );
  }
  if (host.gpu !== null && host.gpu.vramGb.confidence === "estimated") {
    risks.push(
      "WARNING: GPU VRAM is estimated — actual capacity may differ.",
    );
  }

  // Platform support risk
  if (!runtime.supportedPlatforms.includes(platform)) {
    risks.push(
      `RISK: Runtime "${runtime.displayName}" does not officially support platform "${platform}".`,
    );
  }

  // Compatibility-derived risks
  if (compatibility) {
    if (compatibility.classification === "supported_with_limits") {
      risks.push(
        "NOTE: Host meets minimum but not recommended requirements — expect reduced performance.",
      );
    }
    if (compatibility.classification === "cpu_only_slow") {
      risks.push(
        "NOTE: No viable GPU offload — model will run on CPU only, expect slower inference.",
      );
    }
    if (compatibility.limits.requiresDiskSwap) {
      risks.push(
        "NOTE: Model may require disk swap due to tight memory — performance will degrade.",
      );
    }
    if (compatibility.limits.estimatedGpuLayers !== undefined) {
      risks.push(
        `APPROXIMATE (low-confidence): Estimated ~${compatibility.limits.estimatedGpuLayers} GPU layers offloadable. ` +
        `This is a rough heuristic — actual layer count depends on model architecture.`,
      );
    }
  }

  // Reversibility notes
  const hasIrreversible = artifact.warningNotes?.toLowerCase().includes("irreversible");
  if (hasIrreversible) {
    risks.push(
      "CAUTION: Some operations in this plan may be irreversible — review carefully.",
    );
  }

  // Runtime install via curl pipe
  const instructions = runtime.installInstructions[platform];
  if (instructions?.some((cmd) => cmd.includes("curl") && cmd.includes("|"))) {
    risks.push(
      "CAUTION: Runtime install uses a piped download script — review the source URL before executing.",
    );
  }

  return risks;
}

// ---------------------------------------------------------------------------
// Human summary
// ---------------------------------------------------------------------------

function buildSummary(
  artifact: ModelArtifact,
  variant: ModelVariant,
  runtime: RuntimeEntry,
  platform: Platform,
  risks: string[],
): string {
  const warningCount = risks.filter((r) => r.startsWith("WARNING:")).length;
  const cautionCount = risks.filter((r) => r.startsWith("CAUTION:")).length;

  let summary = `Install plan for "${variant.displayName}" (${artifact.quantization}) ` +
    `using ${runtime.displayName} on ${platform}.`;

  if (warningCount > 0 || cautionCount > 0) {
    const parts: string[] = [];
    if (warningCount > 0) parts.push(`${warningCount} warning(s)`);
    if (cautionCount > 0) parts.push(`${cautionCount} caution(s)`);
    summary += ` Review required: ${parts.join(", ")}.`;
  }

  return summary;
}
