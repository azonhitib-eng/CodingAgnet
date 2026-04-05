import { describe, it, expect } from "vitest";
import {
  RuntimeEntrySchema,
  RuntimeManifestSchema,
  PlatformSchema,
  RuntimeTypeSchema,
} from "../../src/schemas/runtime.schema.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validRuntime = {
  id: "ollama",
  displayName: "Ollama",
  type: "local_server" as const,
  detectionCommand: "ollama --version",
  versionCommand: "ollama --version",
  supportedPlatforms: ["linux", "darwin", "win32"] as const,
  requiredDrivers: ["CUDA >= 11.8"],
  capabilities: ["gpu_offload", "batching"],
  installInstructions: {
    linux: ["curl -fsSL https://ollama.ai/install.sh | sh"],
    darwin: ["brew install ollama"],
  },
  postInstallVerification: {
    linux: ["ollama --version"],
    darwin: ["ollama --version"],
  },
  status: "supported" as const,
};

const validManifest = {
  schemaVersion: "1.0.0",
  manifestVersion: "1",
  runtime: validRuntime,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PlatformSchema", () => {
  it.each(["linux", "darwin", "win32"])("accepts '%s'", (v) => {
    expect(PlatformSchema.safeParse(v).success).toBe(true);
  });

  it("rejects unknown platform", () => {
    expect(PlatformSchema.safeParse("freebsd").success).toBe(false);
  });
});

describe("RuntimeTypeSchema", () => {
  it.each(["local_server", "cli_tool", "api_endpoint"])("accepts '%s'", (v) => {
    expect(RuntimeTypeSchema.safeParse(v).success).toBe(true);
  });
});

describe("RuntimeEntrySchema", () => {
  it("accepts a valid runtime", () => {
    expect(RuntimeEntrySchema.safeParse(validRuntime).success).toBe(true);
  });

  it("rejects empty id", () => {
    expect(
      RuntimeEntrySchema.safeParse({ ...validRuntime, id: "" }).success,
    ).toBe(false);
  });

  it("requires at least one supported platform", () => {
    expect(
      RuntimeEntrySchema.safeParse({
        ...validRuntime,
        supportedPlatforms: [],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown platform in supportedPlatforms", () => {
    expect(
      RuntimeEntrySchema.safeParse({
        ...validRuntime,
        supportedPlatforms: ["freebsd"],
      }).success,
    ).toBe(false);
  });

  it("accepts without optional fields", () => {
    const {
      requiredDrivers: _a,
      capabilities: _b,
      postInstallVerification: _c,
      ...minimal
    } = validRuntime;
    expect(RuntimeEntrySchema.safeParse(minimal).success).toBe(true);
  });
});

describe("RuntimeManifestSchema", () => {
  it("accepts a valid manifest", () => {
    expect(RuntimeManifestSchema.safeParse(validManifest).success).toBe(true);
  });

  it("requires schemaVersion", () => {
    const { schemaVersion: _, ...rest } = validManifest;
    expect(RuntimeManifestSchema.safeParse(rest).success).toBe(false);
  });

  it("requires manifestVersion", () => {
    const { manifestVersion: _, ...rest } = validManifest;
    expect(RuntimeManifestSchema.safeParse(rest).success).toBe(false);
  });

  it("round-trips through JSON", () => {
    const first = RuntimeManifestSchema.parse(validManifest);
    const second = RuntimeManifestSchema.safeParse(
      JSON.parse(JSON.stringify(first)),
    );
    expect(second.success).toBe(true);
  });
});
