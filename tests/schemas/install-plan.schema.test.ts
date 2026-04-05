import { describe, it, expect } from "vitest";
import {
  InstallPlanSchema,
  InstallStepSchema,
  PrerequisiteSchema,
  ResourceEstimateSchema,
  VerificationStepSchema,
  RiskLevelSchema,
} from "../../src/schemas/install-plan.schema.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validStep = {
  order: 0,
  command: "ollama pull deepseek-coder-v2:16b-instruct-q4_K_M",
  description: "Pull the quantized model via Ollama",
  riskLevel: "safe" as const,
  requiresApproval: false,
  reversible: true,
  estimatedDurationSec: 300,
};

const validPrerequisite = {
  name: "ollama",
  checkCommand: "ollama --version",
  installHint: "Install via https://ollama.ai",
};

const validVerification = {
  command: "ollama list | grep deepseek-coder-v2",
  expectedOutput: "deepseek-coder-v2:16b",
  description: "Verify model appears in Ollama list",
};

const validPlan = {
  artifactId: "deepseek-coder-v2-16b-q4_k_m-ollama",
  runtimeId: "ollama",
  targetPlatform: "linux" as const,
  prerequisites: [validPrerequisite],
  steps: [validStep],
  postInstallVerification: [validVerification],
  resourceEstimate: {
    diskSpaceGb: 9.1,
    peakRamGb: 14,
    requiresNetwork: true,
    estimatedDownloadGb: 9.1,
  },
  risks: ["Large download may saturate network"],
  humanSummary:
    "Pull DeepSeek Coder V2 16B (q4_k_m) via Ollama. ~9 GB download.",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RiskLevelSchema", () => {
  it.each(["safe", "caution", "dangerous", "blocked"])("accepts '%s'", (v) => {
    expect(RiskLevelSchema.safeParse(v).success).toBe(true);
  });

  it("rejects unknown risk", () => {
    expect(RiskLevelSchema.safeParse("yolo").success).toBe(false);
  });
});

describe("InstallStepSchema", () => {
  it("accepts a valid step", () => {
    expect(InstallStepSchema.safeParse(validStep).success).toBe(true);
  });

  it("accepts step with platform restriction", () => {
    expect(
      InstallStepSchema.safeParse({
        ...validStep,
        platforms: ["linux", "darwin"],
      }).success,
    ).toBe(true);
  });

  it("rejects negative order", () => {
    expect(
      InstallStepSchema.safeParse({ ...validStep, order: -1 }).success,
    ).toBe(false);
  });

  it("rejects empty command", () => {
    expect(
      InstallStepSchema.safeParse({ ...validStep, command: "" }).success,
    ).toBe(false);
  });
});

describe("PrerequisiteSchema", () => {
  it("accepts a valid prerequisite", () => {
    expect(PrerequisiteSchema.safeParse(validPrerequisite).success).toBe(true);
  });
});

describe("ResourceEstimateSchema", () => {
  it("accepts valid estimate", () => {
    expect(
      ResourceEstimateSchema.safeParse(validPlan.resourceEstimate).success,
    ).toBe(true);
  });

  it("accepts minimal estimate (no optional)", () => {
    expect(
      ResourceEstimateSchema.safeParse({
        diskSpaceGb: 0,
        requiresNetwork: false,
      }).success,
    ).toBe(true);
  });
});

describe("VerificationStepSchema", () => {
  it("accepts valid verification", () => {
    expect(VerificationStepSchema.safeParse(validVerification).success).toBe(
      true,
    );
  });

  it("accepts without expectedOutput", () => {
    const { expectedOutput: _, ...minimal } = validVerification;
    expect(VerificationStepSchema.safeParse(minimal).success).toBe(true);
  });
});

describe("InstallPlanSchema", () => {
  it("accepts a valid plan", () => {
    expect(InstallPlanSchema.safeParse(validPlan).success).toBe(true);
  });

  it("rejects missing artifactId", () => {
    const { artifactId: _, ...rest } = validPlan;
    expect(InstallPlanSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing humanSummary", () => {
    const { humanSummary: _, ...rest } = validPlan;
    expect(InstallPlanSchema.safeParse(rest).success).toBe(false);
  });

  it("round-trips through JSON", () => {
    const first = InstallPlanSchema.parse(validPlan);
    const second = InstallPlanSchema.safeParse(
      JSON.parse(JSON.stringify(first)),
    );
    expect(second.success).toBe(true);
  });
});
