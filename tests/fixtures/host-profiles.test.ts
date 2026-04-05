/**
 * Tests for host profile fixture infrastructure.
 *
 * Validates that fixture profiles are well-formed, conform to the
 * HostProfile type contract, and pass schema validation.
 */

import { describe, it, expect } from "vitest";
import {
  ALL_FIXTURE_PROFILES,
  lowEndCpuOnly,
  midRangeGpu,
  highEndGpu,
  missingRuntime,
  partiallyUnknown,
  unsupportedWeak,
  type FixtureProfileName,
} from "../fixtures/host-profiles.js";
import { HostProfileSchema } from "../../src/schemas/host.schema.js";

// ---------------------------------------------------------------------------
// Fixture loading / usage
// ---------------------------------------------------------------------------

describe("host profile fixtures", () => {
  it("exports six named fixture profiles", () => {
    const names = Object.keys(ALL_FIXTURE_PROFILES);
    expect(names).toHaveLength(6);
    expect(names).toContain("lowEndCpuOnly");
    expect(names).toContain("midRangeGpu");
    expect(names).toContain("highEndGpu");
    expect(names).toContain("missingRuntime");
    expect(names).toContain("partiallyUnknown");
    expect(names).toContain("unsupportedWeak");
  });

  it("fixture map values match named exports", () => {
    expect(ALL_FIXTURE_PROFILES.lowEndCpuOnly).toBe(lowEndCpuOnly);
    expect(ALL_FIXTURE_PROFILES.midRangeGpu).toBe(midRangeGpu);
    expect(ALL_FIXTURE_PROFILES.highEndGpu).toBe(highEndGpu);
    expect(ALL_FIXTURE_PROFILES.missingRuntime).toBe(missingRuntime);
    expect(ALL_FIXTURE_PROFILES.partiallyUnknown).toBe(partiallyUnknown);
    expect(ALL_FIXTURE_PROFILES.unsupportedWeak).toBe(unsupportedWeak);
  });

  // -------------------------------------------------------------------------
  // Schema validation for each profile
  // -------------------------------------------------------------------------

  const profileEntries = Object.entries(ALL_FIXTURE_PROFILES) as [
    FixtureProfileName,
    (typeof ALL_FIXTURE_PROFILES)[FixtureProfileName],
  ][];

  for (const [name, profile] of profileEntries) {
    it(`${name} passes HostProfileSchema validation`, () => {
      const result = HostProfileSchema.safeParse(profile);
      expect(result.success).toBe(true);
    });
  }

  // -------------------------------------------------------------------------
  // Structural sanity checks
  // -------------------------------------------------------------------------

  for (const [name, profile] of profileEntries) {
    describe(`${name} structural checks`, () => {
      it("has a valid ISO-8601 detectedAt timestamp", () => {
        expect(profile.detectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });

      it("has os with platform, release, arch", () => {
        expect(profile.os).toBeDefined();
        expect(profile.os.platform).toBeDefined();
        expect(profile.os.platform.confidence).toBeDefined();
        expect(profile.os.release).toBeDefined();
        expect(profile.os.arch).toBeDefined();
      });

      it("has cpu with model, cores, threads", () => {
        expect(profile.cpu).toBeDefined();
        expect(profile.cpu.model).toBeDefined();
        expect(profile.cpu.cores).toBeDefined();
        expect(profile.cpu.threads).toBeDefined();
      });

      it("has memory with totalGb and availableGb", () => {
        expect(profile.memory).toBeDefined();
        expect(profile.memory.totalGb).toBeDefined();
        expect(profile.memory.availableGb).toBeDefined();
      });

      it("has gpu that is null or a valid GpuInfo", () => {
        if (profile.gpu !== null) {
          expect(profile.gpu.present).toBeDefined();
          expect(profile.gpu.model).toBeDefined();
          expect(profile.gpu.vramGb).toBeDefined();
        }
      });

      it("has installedRuntimes as an array", () => {
        expect(Array.isArray(profile.installedRuntimes)).toBe(true);
      });

      it("has missingDependencies as an array", () => {
        expect(Array.isArray(profile.missingDependencies)).toBe(true);
      });
    });
  }

  // -------------------------------------------------------------------------
  // Profile characteristic checks
  // -------------------------------------------------------------------------

  describe("profile characteristics", () => {
    it("lowEndCpuOnly has no GPU and limited RAM", () => {
      expect(lowEndCpuOnly.gpu).toBeNull();
      expect(lowEndCpuOnly.memory.totalGb.value).toBeLessThanOrEqual(8);
    });

    it("midRangeGpu has a GPU with 12 GB VRAM", () => {
      expect(midRangeGpu.gpu).not.toBeNull();
      expect(midRangeGpu.gpu!.vramGb.value).toBe(12);
    });

    it("highEndGpu has a GPU with 24 GB VRAM and 64 GB RAM", () => {
      expect(highEndGpu.gpu).not.toBeNull();
      expect(highEndGpu.gpu!.vramGb.value).toBe(24);
      expect(highEndGpu.memory.totalGb.value).toBe(64);
    });

    it("missingRuntime has no installed runtimes", () => {
      expect(missingRuntime.installedRuntimes).toHaveLength(0);
    });

    it("partiallyUnknown has some unknown confidence values", () => {
      expect(partiallyUnknown.os.arch.confidence).toBe("unknown");
      expect(partiallyUnknown.cpu.cores.confidence).toBe("unknown");
      expect(partiallyUnknown.gpu!.vramGb.confidence).toBe("unknown");
    });

    it("unsupportedWeak has very low RAM", () => {
      expect(unsupportedWeak.memory.totalGb.value).toBeLessThanOrEqual(2);
    });
  });
});
