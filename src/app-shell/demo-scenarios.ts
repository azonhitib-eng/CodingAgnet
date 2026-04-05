/**
 * Embedded demo/fixture scenarios for the app shell.
 *
 * These self-contained scenarios mirror the test fixture examples
 * but live in src/ so the app shell can use them at runtime without
 * importing from the tests/ directory.
 *
 * Each scenario is a complete "raw backend output" tuple that can
 * be mapped through the frontend-contract layer.
 */

import type {
  HostProfile,
  GpuInfo,
  CompatibilityResult,
  InstallPlan,
  ModelRecommendation,
  SafetyReport,
} from "../types/index.js";

import type {
  WorkflowResult,
  WorkflowStageName,
  CompletedStage,
} from "../workflow/types.js";

// ---------------------------------------------------------------------------
// Scenario input shape
// ---------------------------------------------------------------------------

export interface DemoScenario {
  /** Human-readable label. */
  label: string;
  /** Short description. */
  description: string;
  host: HostProfile;
  recommendation: ModelRecommendation | null;
  compatibility: CompatibilityResult | null;
  plan: InstallPlan | null;
  safety: SafetyReport | null;
  workflow: WorkflowResult;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function certain<T>(value: T, source?: string) {
  return { value, confidence: "certain" as const, source };
}

function unknown<T>(source?: string) {
  return { value: null as T | null, confidence: "unknown" as const, source };
}

function completedStages(names: WorkflowStageName[]): CompletedStage[] {
  return names.map((stage) => ({
    stage,
    output: {} as never,
  }));
}

const ALL_STAGES: WorkflowStageName[] = [
  "catalog_loading",
  "host_acquisition",
  "recommendation",
  "target_selection",
  "compatibility_evaluation",
  "install_planning",
  "safety_evaluation",
  "rendering",
];

// ---------------------------------------------------------------------------
// Shared host profiles
// ---------------------------------------------------------------------------

const midRangeGpuHost: HostProfile = {
  detectedAt: "2025-01-15T10:00:00Z",
  os: {
    platform: certain("linux"),
    release: certain("6.5.0-generic"),
    arch: certain("x64"),
  },
  cpu: {
    model: certain("AMD Ryzen 7 5800X 8-Core Processor"),
    cores: certain(8),
    threads: certain(16),
  },
  memory: {
    totalGb: certain(32),
    availableGb: certain(24.5),
  },
  gpu: {
    present: certain(true),
    model: certain("NVIDIA GeForce RTX 3060"),
    vramGb: certain(12),
    cudaVersion: unknown("not queried"),
    rocmVersion: unknown("not applicable"),
    driverVersion: certain("535.183.01"),
  } as GpuInfo,
  installedRuntimes: [
    { runtimeId: "ollama", version: certain("0.4.1") },
  ],
  missingDependencies: [],
};

const lowEndCpuOnlyHost: HostProfile = {
  detectedAt: "2025-01-15T10:00:00Z",
  os: {
    platform: certain("linux"),
    release: certain("6.1.0-generic"),
    arch: certain("x64"),
  },
  cpu: {
    model: certain("Intel(R) Celeron(R) N5105 @ 2.00GHz"),
    cores: certain(2),
    threads: certain(4),
  },
  memory: {
    totalGb: certain(8),
    availableGb: certain(5.2),
  },
  gpu: null,
  installedRuntimes: [],
  missingDependencies: ["ollama", "llama-cpp"],
};

const highEndGpuHost: HostProfile = {
  detectedAt: "2025-01-15T10:00:00Z",
  os: {
    platform: certain("linux"),
    release: certain("6.8.0-generic"),
    arch: certain("x64"),
  },
  cpu: {
    model: certain("AMD Ryzen 9 7950X 16-Core Processor"),
    cores: certain(16),
    threads: certain(32),
  },
  memory: {
    totalGb: certain(64),
    availableGb: certain(52.3),
  },
  gpu: {
    present: certain(true),
    model: certain("NVIDIA GeForce RTX 4090"),
    vramGb: certain(24),
    cudaVersion: unknown("not queried"),
    rocmVersion: unknown("not applicable"),
    driverVersion: certain("550.54.14"),
  } as GpuInfo,
  installedRuntimes: [
    { runtimeId: "ollama", version: certain("0.4.5") },
    { runtimeId: "llama-cpp", version: certain("b3500") },
  ],
  missingDependencies: [],
};

const unsupportedWeakHost: HostProfile = {
  detectedAt: "2025-01-15T10:00:00Z",
  os: {
    platform: certain("linux"),
    release: certain("5.4.0-generic"),
    arch: certain("x64"),
  },
  cpu: {
    model: certain("Intel(R) Atom(TM) x5-Z8350 @ 1.44GHz"),
    cores: certain(2),
    threads: certain(2),
  },
  memory: {
    totalGb: certain(2),
    availableGb: certain(0.8),
  },
  gpu: null,
  installedRuntimes: [],
  missingDependencies: ["ollama", "llama-cpp"],
};

// ---------------------------------------------------------------------------
// Shared compatibility results
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

// ---------------------------------------------------------------------------
// Shared install plan and safety
// ---------------------------------------------------------------------------

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
// Demo scenarios
// ---------------------------------------------------------------------------

export const DEMO_SCENARIOS: Record<string, DemoScenario> = {
  midRangeGpu: {
    label: "Mid-Range GPU",
    description: "RTX 3060 system — fully supported, requires approval for curl|sh install",
    host: midRangeGpuHost,
    recommendation: sampleRecommendation,
    compatibility: supportedCompat,
    plan: samplePlan,
    safety: approvalSafety,
    workflow: {
      status: "completed_requires_approval",
      completedStages: completedStages(ALL_STAGES),
      stageOutputs: {},
    },
  },

  highEndGpu: {
    label: "High-End GPU",
    description: "RTX 4090 system — fully supported, all stages complete",
    host: highEndGpuHost,
    recommendation: sampleRecommendation,
    compatibility: supportedCompat,
    plan: samplePlan,
    safety: approvalSafety,
    workflow: {
      status: "completed_requires_approval",
      completedStages: completedStages(ALL_STAGES),
      stageOutputs: {},
    },
  },

  lowEndCpuOnly: {
    label: "Low-End CPU Only",
    description: "No GPU, 8 GB RAM — CPU-only inference, significantly slower",
    host: lowEndCpuOnlyHost,
    recommendation: {
      ...sampleRecommendation,
      compatibility: cpuOnlyCompat,
      score: 36,
      explanations: [
        "CPU-only inference — significantly slower",
        "Q4_K_M quantization is memory-efficient",
      ],
    },
    compatibility: cpuOnlyCompat,
    plan: samplePlan,
    safety: approvalSafety,
    workflow: {
      status: "completed_requires_approval",
      completedStages: completedStages(ALL_STAGES),
      stageOutputs: {},
    },
  },

  unsupported: {
    label: "Unsupported Machine",
    description: "2 GB RAM, no GPU — below minimum requirements, workflow failed",
    host: unsupportedWeakHost,
    recommendation: null,
    compatibility: unsupportedCompat,
    plan: null,
    safety: null,
    workflow: {
      status: "failed",
      completedStages: completedStages([
        "catalog_loading",
        "host_acquisition",
        "recommendation",
      ]),
      stageOutputs: {},
      failedStage: "target_selection" as WorkflowStageName,
      error: "No compatible artifacts found for this host.",
    },
  },

  blockedWorkflow: {
    label: "Blocked Workflow",
    description: "Dangerous install plan — blocked by safety policy",
    host: midRangeGpuHost,
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
    },
    safety: blockedSafety,
    workflow: {
      status: "blocked",
      completedStages: completedStages([
        "catalog_loading",
        "host_acquisition",
        "recommendation",
        "target_selection",
        "compatibility_evaluation",
        "install_planning",
        "safety_evaluation",
      ]),
      stageOutputs: {},
    },
  },

  partialWorkflow: {
    label: "Partial Workflow",
    description: "Workflow intentionally stopped after recommendation stage",
    host: midRangeGpuHost,
    recommendation: sampleRecommendation,
    compatibility: null,
    plan: null,
    safety: null,
    workflow: {
      status: "partial",
      completedStages: completedStages([
        "catalog_loading",
        "host_acquisition",
        "recommendation",
      ]),
      stageOutputs: {},
      stoppedAfter: "recommendation" as WorkflowStageName,
    },
  },
};

export type DemoScenarioName = keyof typeof DEMO_SCENARIOS;

export const DEMO_SCENARIO_NAMES = Object.keys(DEMO_SCENARIOS) as DemoScenarioName[];
