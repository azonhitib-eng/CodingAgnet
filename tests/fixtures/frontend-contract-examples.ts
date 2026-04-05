/**
 * Representative frontend-contract fixture examples.
 *
 * These examples cover 7 key scenarios using the existing host-profile
 * fixtures and deterministic backend shapes.  They serve as reference
 * outputs for frontend development and snapshot-style tests.
 *
 * Scenarios:
 *   1. lowEndCpuOnly   — CPU-only, slow inference
 *   2. midRangeGpu     — mid-range GPU, full support
 *   3. highEndGpu      — high-end GPU, full support
 *   4. unsupportedWeak — below minimum requirements
 *   5. blockedWorkflow — workflow blocked by safety policy
 *   6. approvalWorkflow — workflow completed, requires human approval
 *   7. partialWorkflow — workflow stopped early
 */

import type {
  CompatibilityResult,
  InstallPlan,
  ModelRecommendation,
  SafetyReport,
} from "../../src/types/index.js";

import type { WorkflowResult, WorkflowStageName, CompletedStage } from "../../src/workflow/types.js";

import {
  lowEndCpuOnly,
  midRangeGpu,
  highEndGpu,
  unsupportedWeak,
} from "./host-profiles.js";

// ---------------------------------------------------------------------------
// Helper: build CompletedStage array from names
// ---------------------------------------------------------------------------

function completedStages(names: WorkflowStageName[]): CompletedStage[] {
  return names.map((stage) => ({
    stage,
    output: {} as never, // placeholder — not inspected in view-model tests
  }));
}

// ---------------------------------------------------------------------------
// Shared backend output snippets
// ---------------------------------------------------------------------------

const supportedCompat: CompatibilityResult = {
  classification: "supported",
  bottlenecks: [],
  limits: {
    gpuOffloadPossible: true,
    estimatedGpuLayers: 32,
    requiresDiskSwap: false,
    effectiveContextWindow: 4096,
  },
  settingsAdjustments: [],
  reasons: ["Meets all recommended requirements"],
  warnings: [],
};

const cpuOnlyCompat: CompatibilityResult = {
  classification: "cpu_only_slow",
  bottlenecks: ["vram"],
  limits: {
    gpuOffloadPossible: false,
    requiresDiskSwap: false,
    effectiveContextWindow: 4096,
  },
  settingsAdjustments: [
    {
      parameter: "threads",
      suggestedValue: "4",
      reason: "Limit CPU threads to avoid thermal throttling",
    },
  ],
  reasons: ["No GPU available — inference will run on CPU only"],
  warnings: ["Expect 5–20× slower inference compared to GPU"],
};

const unsupportedCompat: CompatibilityResult = {
  classification: "unsupported",
  bottlenecks: ["ram"],
  limits: {
    gpuOffloadPossible: false,
    requiresDiskSwap: false,
    effectiveContextWindow: 0,
  },
  settingsAdjustments: [],
  reasons: ["RAM below absolute minimum (2 GB < 4 GB required)"],
  warnings: [],
};

const samplePlan: InstallPlan = {
  artifactId: "codellama-7b-q4_k_m-ollama",
  runtimeId: "ollama",
  targetPlatform: "linux",
  prerequisites: [
    { name: "curl", checkCommand: "which curl", installHint: "apt install curl" },
  ],
  steps: [
    {
      order: 1,
      command: "curl -fsSL https://ollama.com/install.sh | sh",
      description: "Install Ollama runtime",
      riskLevel: "caution",
      requiresApproval: true,
      reversible: false,
      estimatedDurationSec: 30,
    },
    {
      order: 2,
      command: "ollama pull codellama:7b-q4_k_m",
      description: "Pull model artifact",
      riskLevel: "safe",
      requiresApproval: false,
      reversible: true,
      estimatedDurationSec: 120,
    },
  ],
  postInstallVerification: [
    { command: "ollama list", expectedOutput: "codellama", description: "Verify model is downloaded" },
  ],
  resourceEstimate: {
    diskSpaceGb: 4.1,
    peakRamGb: 6,
    requiresNetwork: true,
    estimatedDownloadGb: 3.8,
  },
  risks: ["Network download of ~3.8 GB required"],
  humanSummary: "Install Ollama and pull CodeLlama 7B (Q4_K_M quantization).",
};

const approvalSafety: SafetyReport = {
  planId: "codellama-7b-q4_k_m-ollama",
  violations: [
    {
      stepIndex: 0,
      type: "command",
      description: "curl|sh pattern detected — remote script execution",
      severity: "caution",
    },
  ],
  warnings: ["Step 1 uses curl|sh — review the script before approving"],
  approved: false,
  blocked: false,
  requiresHumanApproval: true,
};

const blockedSafety: SafetyReport = {
  planId: "dangerous-plan",
  violations: [
    {
      stepIndex: 0,
      type: "command",
      description: "rm -rf / detected — recursive delete of root filesystem",
      severity: "blocked",
    },
  ],
  warnings: [],
  approved: false,
  blocked: true,
  requiresHumanApproval: false,
};

const sampleRecommendation: ModelRecommendation = {
  artifactId: "codellama-7b-q4_k_m-ollama",
  variantId: "codellama-7b",
  familyId: "codellama",
  displayName: "CodeLlama 7B (Q4_K_M, Ollama)",
  compatibility: supportedCompat,
  score: 106,
  explanations: [
    "Fully supported on this hardware",
    "Q4_K_M quantization provides good quality/performance balance",
  ],
};

// ---------------------------------------------------------------------------
// Scenario 1: Low-end CPU-only
// ---------------------------------------------------------------------------

export const lowEndCpuOnlyExample = {
  host: lowEndCpuOnly,
  recommendation: {
    ...sampleRecommendation,
    compatibility: cpuOnlyCompat,
    score: 36,
    explanations: [
      "CPU-only inference — significantly slower",
      "Q4_K_M quantization is memory-efficient",
    ],
  } satisfies ModelRecommendation,
  compatibility: cpuOnlyCompat,
  plan: samplePlan,
  safety: approvalSafety,
  workflow: {
    status: "completed_requires_approval",
    completedStages: completedStages([
      "catalog_loading", "host_acquisition", "recommendation",
      "target_selection", "compatibility_evaluation",
      "install_planning", "safety_evaluation", "rendering",
    ]),
    stageOutputs: {},
  } satisfies WorkflowResult,
} as const;

// ---------------------------------------------------------------------------
// Scenario 2: Mid-range GPU
// ---------------------------------------------------------------------------

export const midRangeGpuExample = {
  host: midRangeGpu,
  recommendation: sampleRecommendation,
  compatibility: supportedCompat,
  plan: samplePlan,
  safety: approvalSafety,
  workflow: {
    status: "completed_requires_approval",
    completedStages: completedStages([
      "catalog_loading", "host_acquisition", "recommendation",
      "target_selection", "compatibility_evaluation",
      "install_planning", "safety_evaluation", "rendering",
    ]),
    stageOutputs: {},
  } satisfies WorkflowResult,
} as const;

// ---------------------------------------------------------------------------
// Scenario 3: High-end GPU
// ---------------------------------------------------------------------------

export const highEndGpuExample = {
  host: highEndGpu,
  recommendation: sampleRecommendation,
  compatibility: supportedCompat,
  plan: samplePlan,
  safety: approvalSafety,
  workflow: {
    status: "completed_requires_approval",
    completedStages: completedStages([
      "catalog_loading", "host_acquisition", "recommendation",
      "target_selection", "compatibility_evaluation",
      "install_planning", "safety_evaluation", "rendering",
    ]),
    stageOutputs: {},
  } satisfies WorkflowResult,
} as const;

// ---------------------------------------------------------------------------
// Scenario 4: Unsupported machine
// ---------------------------------------------------------------------------

export const unsupportedExample = {
  host: unsupportedWeak,
  recommendation: null, // no recommendations for unsupported
  compatibility: unsupportedCompat,
  plan: null,
  safety: null,
  workflow: {
    status: "failed",
    completedStages: completedStages([
      "catalog_loading", "host_acquisition", "recommendation",
    ]),
    stageOutputs: {},
    failedStage: "target_selection" as WorkflowStageName,
    error: "No compatible artifacts found for this host.",
  } satisfies WorkflowResult,
} as const;

// ---------------------------------------------------------------------------
// Scenario 5: Blocked workflow
// ---------------------------------------------------------------------------

export const blockedWorkflowExample = {
  host: midRangeGpu,
  recommendation: sampleRecommendation,
  compatibility: supportedCompat,
  plan: {
    ...samplePlan,
    steps: [
      {
        order: 1,
        command: "rm -rf /",
        description: "Dangerous: delete root",
        riskLevel: "blocked" as const,
        requiresApproval: true,
        reversible: false,
      },
    ],
  } satisfies InstallPlan,
  safety: blockedSafety,
  workflow: {
    status: "blocked",
    completedStages: completedStages([
      "catalog_loading", "host_acquisition", "recommendation",
      "target_selection", "compatibility_evaluation",
      "install_planning", "safety_evaluation",
    ]),
    stageOutputs: {},
  } satisfies WorkflowResult,
} as const;

// ---------------------------------------------------------------------------
// Scenario 6: Requires-approval workflow
// ---------------------------------------------------------------------------

export const approvalWorkflowExample = {
  host: midRangeGpu,
  recommendation: sampleRecommendation,
  compatibility: supportedCompat,
  plan: samplePlan,
  safety: approvalSafety,
  workflow: {
    status: "completed_requires_approval",
    completedStages: completedStages([
      "catalog_loading", "host_acquisition", "recommendation",
      "target_selection", "compatibility_evaluation",
      "install_planning", "safety_evaluation", "rendering",
    ]),
    stageOutputs: {},
  } satisfies WorkflowResult,
} as const;

// ---------------------------------------------------------------------------
// Scenario 7: Partial workflow (stopped early)
// ---------------------------------------------------------------------------

export const partialWorkflowExample = {
  host: midRangeGpu,
  recommendation: sampleRecommendation,
  compatibility: null,
  plan: null,
  safety: null,
  workflow: {
    status: "partial",
    completedStages: completedStages([
      "catalog_loading", "host_acquisition", "recommendation",
    ]),
    stageOutputs: {},
    stoppedAfter: "recommendation" as WorkflowStageName,
  } satisfies WorkflowResult,
} as const;

// ---------------------------------------------------------------------------
// Named map for iteration
// ---------------------------------------------------------------------------

export const ALL_FRONTEND_EXAMPLES = {
  lowEndCpuOnly: lowEndCpuOnlyExample,
  midRangeGpu: midRangeGpuExample,
  highEndGpu: highEndGpuExample,
  unsupported: unsupportedExample,
  blockedWorkflow: blockedWorkflowExample,
  approvalWorkflow: approvalWorkflowExample,
  partialWorkflow: partialWorkflowExample,
} as const;

export type FrontendExampleName = keyof typeof ALL_FRONTEND_EXAMPLES;
