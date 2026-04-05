/**
 * Support-class semantics: defines what each CompatibilityClass means
 * in practical terms across representative hardware classes.
 *
 * This is the canonical reference for what "supported", "supported_with_limits",
 * "cpu_only_slow", and "unsupported" mean. Used for regression testing
 * and documentation.
 */

import type { CompatibilityClass } from "../../src/types/compatibility.js";

// ---------------------------------------------------------------------------
// Support-class semantic definitions
// ---------------------------------------------------------------------------

export interface SupportClassSemantics {
  /** The compatibility classification. */
  classification: CompatibilityClass;
  /** Human-readable description of what this class means. */
  description: string;
  /** Practical implications for the user. */
  implications: string[];
  /** Example hardware scenarios. */
  exampleScenarios: string[];
  /** Whether install plans should be generated. */
  generateInstallPlan: boolean;
  /** Whether the workflow should complete normally. */
  workflowTerminalStatus: "completed" | "completed_requires_approval" | "blocked";
}

export const SUPPORT_CLASS_SEMANTICS: Record<CompatibilityClass, SupportClassSemantics> = {
  supported: {
    classification: "supported",
    description:
      "Host meets all recommended requirements. The model should run with full " +
      "performance, full context window, and GPU acceleration where applicable.",
    implications: [
      "Full context window available",
      "GPU offload possible if GPU present",
      "No disk swap needed",
      "No performance degradation expected",
    ],
    exampleScenarios: [
      "High-end GPU (RTX 4090, 64GB RAM) running 7B q4_k_m model",
      "Mid-range GPU (RTX 3060, 32GB RAM) running 7B q4_k_m model",
    ],
    generateInstallPlan: true,
    workflowTerminalStatus: "completed",
  },

  supported_with_limits: {
    classification: "supported_with_limits",
    description:
      "Host meets minimum but not all recommended requirements. The model can run " +
      "but with reduced context window, partial GPU offload, or degraded throughput.",
    implications: [
      "Context window may be reduced",
      "Partial GPU offload (fewer layers offloaded)",
      "Disk swap may be needed for larger models",
      "Settings adjustments recommended",
    ],
    exampleScenarios: [
      "Mid-range GPU (RTX 3060, 32GB RAM) running 13B model",
      "8GB RAM machine with GPU running 7B model near RAM boundary",
    ],
    generateInstallPlan: true,
    workflowTerminalStatus: "completed",
  },

  cpu_only_slow: {
    classification: "cpu_only_slow",
    description:
      "No viable GPU offload. The model will run entirely on CPU, resulting in " +
      "significantly slower inference. Usable but not practical for interactive use.",
    implications: [
      "All inference runs on CPU — expect 5-20x slower than GPU",
      "Full context window may still be available if RAM is sufficient",
      "No GPU acceleration benefit",
      "May be acceptable for batch/offline use",
    ],
    exampleScenarios: [
      "CPU-only laptop (8GB RAM) running small 7B model",
      "Machine with GPU but VRAM below model minimum",
    ],
    generateInstallPlan: true,
    workflowTerminalStatus: "completed",
  },

  unsupported: {
    classification: "unsupported",
    description:
      "Host fails critical requirements. The model cannot run reliably or at all. " +
      "This includes insufficient RAM, missing runtime, or incompatible OS.",
    implications: [
      "Model will not run or will crash",
      "Required runtime is not installed",
      "OS is not compatible with the runtime",
      "RAM is below absolute minimum",
    ],
    exampleScenarios: [
      "2GB RAM machine trying to run any model",
      "Machine with no runtimes installed",
      "Windows machine with Linux-only runtime",
    ],
    generateInstallPlan: false,
    workflowTerminalStatus: "blocked",
  },
};

// ---------------------------------------------------------------------------
// Expected behaviors per fixture profile
// ---------------------------------------------------------------------------

/**
 * Maps fixture profile names to the expected dominant compatibility classes
 * they should produce for the majority of catalog artifacts.
 *
 * This is used for regression testing: if a code change causes a fixture
 * profile to suddenly produce different compatibility classes, the test
 * suite catches it.
 */
export interface ProfileExpectation {
  /** Expected classification for small (7B) models. */
  small7B: CompatibilityClass;
  /** Expected classification for medium (13B) models. */
  medium13B: CompatibilityClass;
  /** Expected classification for large (34B) models (if applicable). */
  large34B: CompatibilityClass;
  /** Whether any recommendations should be returned (excluding unsupported). */
  hasRecommendations: boolean;
  /** Expected workflow terminal status for default (top-ranked) artifact. */
  expectedWorkflowStatus: string;
}

export const PROFILE_EXPECTATIONS: Record<string, ProfileExpectation> = {
  lowEndCpuOnly: {
    small7B: "cpu_only_slow",
    medium13B: "unsupported",
    large34B: "unsupported",
    hasRecommendations: true,
    // Workflow produces completed_requires_approval because install plans
    // contain curl-pipe commands classified as "caution" risk level.
    expectedWorkflowStatus: "completed_requires_approval",
  },
  midRangeGpu: {
    small7B: "supported",
    medium13B: "supported",
    // 34B model requires 20GB minimum VRAM; RTX 3060 has 12GB → CPU fallback.
    large34B: "cpu_only_slow",
    hasRecommendations: true,
    expectedWorkflowStatus: "completed_requires_approval",
  },
  highEndGpu: {
    small7B: "supported",
    medium13B: "supported",
    large34B: "supported",
    hasRecommendations: true,
    // Even high-end workflows require approval due to caution-level install steps.
    expectedWorkflowStatus: "completed_requires_approval",
  },
  missingRuntime: {
    small7B: "unsupported",
    medium13B: "unsupported",
    large34B: "unsupported",
    hasRecommendations: false,
    expectedWorkflowStatus: "failed",
  },
  partiallyUnknown: {
    small7B: "supported",
    // 16GB estimated RAM meets the 16GB recommended for medium q4_k_m models;
    // GPU VRAM unknown triggers optimistic GPU offload assumption → "supported".
    medium13B: "supported",
    large34B: "unsupported",
    hasRecommendations: true,
    expectedWorkflowStatus: "completed_requires_approval",
  },
  unsupportedWeak: {
    small7B: "unsupported",
    medium13B: "unsupported",
    large34B: "unsupported",
    hasRecommendations: false,
    expectedWorkflowStatus: "failed",
  },
};
