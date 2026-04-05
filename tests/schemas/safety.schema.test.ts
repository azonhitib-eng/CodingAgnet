import { describe, it, expect } from "vitest";
import {
  CommandClassificationSchema,
  PathClassificationSchema,
  PathSensitivitySchema,
  ExecutionPolicySchema,
  ExecutionModeSchema,
  SafetyViolationSchema,
  SafetyReportSchema,
} from "../../src/schemas/safety.schema.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validCommandClassification = {
  command: "rm -rf /tmp/model-cache",
  riskLevel: "dangerous" as const,
  reason: "Recursive force-delete on filesystem path",
  requiresApproval: true,
};

const validPathClassification = {
  path: "/home/user/.ssh/id_rsa",
  sensitivity: "secret" as const,
  reason: "SSH private key",
};

const validExecutionPolicy = {
  mode: "plan_only" as const,
  requireApprovalFor: ["caution", "dangerous", "blocked"] as const,
  blockedPathPatterns: ["/etc/**", "/boot/**"],
  sensitivePathPatterns: ["**/.ssh/**", "**/.gnupg/**", "**/.env"],
};

const validSafetyReport = {
  planId: "install-deepseek-001",
  violations: [
    {
      stepIndex: 2,
      type: "command" as const,
      description: "Step uses sudo",
      severity: "dangerous" as const,
    },
  ],
  warnings: ["Plan requires network access"],
  approved: false,
  blocked: false,
  requiresHumanApproval: true,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CommandClassificationSchema", () => {
  it("accepts a valid classification", () => {
    expect(
      CommandClassificationSchema.safeParse(validCommandClassification).success,
    ).toBe(true);
  });

  it("rejects empty command", () => {
    expect(
      CommandClassificationSchema.safeParse({
        ...validCommandClassification,
        command: "",
      }).success,
    ).toBe(false);
  });
});

describe("PathSensitivitySchema", () => {
  it.each(["normal", "sensitive", "secret", "blocked"])("accepts '%s'", (v) => {
    expect(PathSensitivitySchema.safeParse(v).success).toBe(true);
  });

  it("rejects unknown sensitivity", () => {
    expect(PathSensitivitySchema.safeParse("top_secret").success).toBe(false);
  });
});

describe("PathClassificationSchema", () => {
  it("accepts a valid classification", () => {
    expect(
      PathClassificationSchema.safeParse(validPathClassification).success,
    ).toBe(true);
  });
});

describe("ExecutionModeSchema", () => {
  it.each(["plan_only", "prompt_each", "auto_safe_only"])(
    "accepts '%s'",
    (v) => {
      expect(ExecutionModeSchema.safeParse(v).success).toBe(true);
    },
  );
});

describe("ExecutionPolicySchema", () => {
  it("accepts a valid policy", () => {
    expect(
      ExecutionPolicySchema.safeParse(validExecutionPolicy).success,
    ).toBe(true);
  });

  it("accepts empty blocked/sensitive patterns", () => {
    expect(
      ExecutionPolicySchema.safeParse({
        ...validExecutionPolicy,
        blockedPathPatterns: [],
        sensitivePathPatterns: [],
      }).success,
    ).toBe(true);
  });
});

describe("SafetyViolationSchema", () => {
  it("accepts a valid violation", () => {
    expect(
      SafetyViolationSchema.safeParse(validSafetyReport.violations[0]).success,
    ).toBe(true);
  });

  it("rejects negative stepIndex", () => {
    expect(
      SafetyViolationSchema.safeParse({
        ...validSafetyReport.violations[0],
        stepIndex: -1,
      }).success,
    ).toBe(false);
  });

  it("accepts all violation types", () => {
    for (const type of ["command", "path", "execution"]) {
      expect(
        SafetyViolationSchema.safeParse({
          ...validSafetyReport.violations[0],
          type,
        }).success,
      ).toBe(true);
    }
  });
});

describe("SafetyReportSchema", () => {
  it("accepts a valid report", () => {
    expect(SafetyReportSchema.safeParse(validSafetyReport).success).toBe(true);
  });

  it("accepts clean report with no violations", () => {
    expect(
      SafetyReportSchema.safeParse({
        planId: "clean-plan",
        violations: [],
        warnings: [],
        approved: true,
        blocked: false,
        requiresHumanApproval: false,
      }).success,
    ).toBe(true);
  });

  it("round-trips through JSON", () => {
    const first = SafetyReportSchema.parse(validSafetyReport);
    const second = SafetyReportSchema.safeParse(
      JSON.parse(JSON.stringify(first)),
    );
    expect(second.success).toBe(true);
  });
});
