import { describe, it, expect } from "vitest";
import {
  AgentToolEntrySchema,
  AgentToolManifestSchema,
} from "../../src/schemas/agent-tool.schema.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validTool = {
  id: "aider",
  displayName: "Aider",
  purpose: "AI pair programming in the terminal",
  requiredRuntimes: ["ollama"],
  hostAssumptions: ["Python 3.10+", "git installed"],
  suitableUseCases: [
    "Repository-level code editing",
    "Refactoring with LLM assistance",
  ],
  warnings: ["May modify files in-place — always review diffs"],
  installInstructions: {
    linux: ["pip install aider-chat"],
    darwin: ["pip install aider-chat"],
  },
  supportedPlatforms: ["linux", "darwin"] as const,
  status: "supported" as const,
};

const validManifest = {
  schemaVersion: "1.0.0",
  manifestVersion: "1",
  tool: validTool,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AgentToolEntrySchema", () => {
  it("accepts a valid tool entry", () => {
    expect(AgentToolEntrySchema.safeParse(validTool).success).toBe(true);
  });

  it("rejects empty id", () => {
    expect(
      AgentToolEntrySchema.safeParse({ ...validTool, id: "" }).success,
    ).toBe(false);
  });

  it("requires at least one supported platform", () => {
    expect(
      AgentToolEntrySchema.safeParse({
        ...validTool,
        supportedPlatforms: [],
      }).success,
    ).toBe(false);
  });

  it("accepts empty arrays for optional lists", () => {
    expect(
      AgentToolEntrySchema.safeParse({
        ...validTool,
        requiredRuntimes: [],
        hostAssumptions: [],
        suitableUseCases: [],
        warnings: [],
      }).success,
    ).toBe(true);
  });
});

describe("AgentToolManifestSchema", () => {
  it("accepts a valid manifest", () => {
    expect(AgentToolManifestSchema.safeParse(validManifest).success).toBe(true);
  });

  it("requires schemaVersion", () => {
    const { schemaVersion: _, ...rest } = validManifest;
    expect(AgentToolManifestSchema.safeParse(rest).success).toBe(false);
  });

  it("round-trips through JSON", () => {
    const first = AgentToolManifestSchema.parse(validManifest);
    const second = AgentToolManifestSchema.safeParse(
      JSON.parse(JSON.stringify(first)),
    );
    expect(second.success).toBe(true);
  });
});
