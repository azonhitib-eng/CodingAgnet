import { describe, it, expect } from "vitest";
import {
  HostProfileSchema,
  ConfidenceSchema,
  detectedSchema,
  GpuInfoSchema,
} from "../../src/schemas/host.schema.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function certain<T>(value: T) {
  return { value, confidence: "certain" as const };
}

function estimated<T>(value: T, source?: string) {
  return { value, confidence: "estimated" as const, source };
}

function unknown(source?: string) {
  return { value: null, confidence: "unknown" as const, source };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validHostProfile = {
  detectedAt: "2026-04-05T10:00:00.000Z",
  os: {
    platform: certain("linux"),
    release: certain("6.5.0-generic"),
    arch: certain("x64"),
  },
  cpu: {
    model: certain("AMD Ryzen 9 7900X"),
    cores: certain(12),
    threads: certain(24),
  },
  memory: {
    totalGb: certain(64),
    availableGb: estimated(48, "parsed from /proc/meminfo"),
  },
  gpu: {
    present: certain(true),
    model: certain("NVIDIA RTX 4090"),
    vramGb: certain(24),
    cudaVersion: certain("12.2"),
    rocmVersion: unknown(),
    driverVersion: certain("535.86.05"),
  },
  installedRuntimes: [
    { runtimeId: "ollama", version: certain("0.1.30") },
  ],
  missingDependencies: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConfidenceSchema", () => {
  it.each(["certain", "estimated", "unknown"])("accepts '%s'", (v) => {
    expect(ConfidenceSchema.safeParse(v).success).toBe(true);
  });

  it("rejects unknown value", () => {
    expect(ConfidenceSchema.safeParse("maybe").success).toBe(false);
  });
});

describe("detectedSchema", () => {
  const DetectedString = detectedSchema(z.string());

  it("accepts certain value", () => {
    expect(DetectedString.safeParse(certain("hello")).success).toBe(true);
  });

  it("accepts estimated value with source", () => {
    expect(
      DetectedString.safeParse(estimated("guess", "heuristic")).success,
    ).toBe(true);
  });

  it("accepts unknown with null value", () => {
    expect(DetectedString.safeParse(unknown()).success).toBe(true);
  });

  it("rejects unknown with non-null value", () => {
    const bad = { value: "oops", confidence: "unknown" };
    expect(DetectedString.safeParse(bad).success).toBe(false);
  });

  it("accepts certain with null value (sensor failure)", () => {
    // A sensor that ran but returned nothing — still certain it has no data.
    expect(
      DetectedString.safeParse({ value: null, confidence: "certain" }).success,
    ).toBe(true);
  });
});

describe("GpuInfoSchema", () => {
  it("accepts full GPU info", () => {
    expect(GpuInfoSchema.safeParse(validHostProfile.gpu).success).toBe(true);
  });

  it("accepts all-unknown GPU (no GPU detected)", () => {
    const noGpu = {
      present: unknown(),
      model: unknown(),
      vramGb: unknown(),
      cudaVersion: unknown(),
      rocmVersion: unknown(),
      driverVersion: unknown(),
    };
    expect(GpuInfoSchema.safeParse(noGpu).success).toBe(true);
  });
});

describe("HostProfileSchema", () => {
  it("accepts a valid host profile", () => {
    expect(HostProfileSchema.safeParse(validHostProfile).success).toBe(true);
  });

  it("accepts null GPU (no GPU detection attempted)", () => {
    expect(
      HostProfileSchema.safeParse({ ...validHostProfile, gpu: null }).success,
    ).toBe(true);
  });

  it("rejects invalid detectedAt (not ISO datetime)", () => {
    expect(
      HostProfileSchema.safeParse({
        ...validHostProfile,
        detectedAt: "yesterday",
      }).success,
    ).toBe(false);
  });

  it("rejects negative memory", () => {
    const badMem = {
      ...validHostProfile,
      memory: {
        totalGb: certain(-1),
        availableGb: certain(0),
      },
    };
    expect(HostProfileSchema.safeParse(badMem).success).toBe(false);
  });

  it("accepts host with estimated values throughout", () => {
    const fuzzy = {
      ...validHostProfile,
      cpu: {
        model: estimated("Some CPU", "parsed from /proc/cpuinfo"),
        cores: estimated(4),
        threads: unknown("could not determine"),
      },
      memory: {
        totalGb: estimated(16, "sysctl"),
        availableGb: unknown(),
      },
    };
    expect(HostProfileSchema.safeParse(fuzzy).success).toBe(true);
  });

  it("round-trips through JSON", () => {
    const first = HostProfileSchema.parse(validHostProfile);
    const second = HostProfileSchema.safeParse(
      JSON.parse(JSON.stringify(first)),
    );
    expect(second.success).toBe(true);
  });
});
