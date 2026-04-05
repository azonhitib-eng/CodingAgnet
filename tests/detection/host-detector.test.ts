/**
 * Tests for Host detector orchestrator.
 *
 * Tests the aggregate detectHost() function with mocked command runner
 * to verify it assembles a complete HostProfile.
 */

import { describe, it, expect } from "vitest";
import { detectHost } from "../../src/detection/host-detector.js";
import type { RuntimeEntry } from "../../src/types/runtime.js";
import { mockRunner } from "./run-command.test.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRuntime(overrides: Partial<RuntimeEntry> = {}): RuntimeEntry {
  return {
    id: "test-runtime",
    displayName: "Test Runtime",
    type: "cli_tool",
    detectionCommand: "test-cmd --version",
    versionCommand: "test-cmd --version",
    supportedPlatforms: ["linux", "darwin"],
    installInstructions: {},
    status: "supported",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectHost — no runtimes", () => {
  it("returns a valid HostProfile with sync-detected fields", async () => {
    const profile = await detectHost({
      commandRunner: mockRunner({}),
    });

    // OS should always be certain (Node.js builtins)
    expect(profile.os.platform.confidence).toBe("certain");
    expect(profile.os.platform.value).toBeTruthy();

    // CPU
    expect(profile.cpu.threads.confidence).toBe("certain");
    expect(profile.cpu.threads.value).toBeGreaterThan(0);
    expect(profile.cpu.cores.confidence).toBe("estimated");

    // Memory
    expect(profile.memory.totalGb.confidence).toBe("certain");
    expect(profile.memory.totalGb.value).toBeGreaterThan(0);

    // GPU — no nvidia-smi available, so unknown
    expect(profile.gpu).not.toBeNull();

    // No runtimes requested
    expect(profile.installedRuntimes).toEqual([]);
    expect(profile.missingDependencies).toEqual([]);

    // detectedAt should be a valid ISO date
    expect(() => new Date(profile.detectedAt).toISOString()).not.toThrow();
  });
});

describe("detectHost — with catalog runtimes", () => {
  const ollamaRuntime = makeRuntime({
    id: "ollama",
    detectionCommand: "ollama --version",
    versionCommand: "ollama --version",
    supportedPlatforms: ["linux", "darwin", "win32"],
  });

  const llamacppRuntime = makeRuntime({
    id: "llamacpp",
    detectionCommand: "llama-server --version",
    versionCommand: "llama-server --version",
    supportedPlatforms: ["linux", "darwin"],
  });

  it("detects installed runtimes and lists missing ones", async () => {
    const run = mockRunner({
      ollama: {
        stdout: "ollama version 0.3.0",
        stderr: "",
        exitCode: 0,
        ok: true,
      },
      // llama-server not available
    });

    const profile = await detectHost({
      catalogRuntimes: [ollamaRuntime, llamacppRuntime],
      commandRunner: run,
    });

    // ollama detected
    expect(profile.installedRuntimes).toHaveLength(1);
    expect(profile.installedRuntimes[0].runtimeId).toBe("ollama");
    expect(profile.installedRuntimes[0].version.value).toBe("0.3.0");

    // llamacpp missing (if platform supports it)
    const platform = profile.os.platform.value;
    if (platform === "linux" || platform === "darwin") {
      expect(profile.missingDependencies).toContain("llamacpp");
    }
  });

  it("reports all runtimes as missing when none detected", async () => {
    const run = mockRunner({}); // no commands available

    const profile = await detectHost({
      catalogRuntimes: [ollamaRuntime, llamacppRuntime],
      commandRunner: run,
    });

    expect(profile.installedRuntimes).toHaveLength(0);
    // Both should be missing (at least on linux/darwin where both are supported)
    const platform = profile.os.platform.value;
    if (platform === "linux" || platform === "darwin") {
      expect(profile.missingDependencies).toContain("ollama");
      expect(profile.missingDependencies).toContain("llamacpp");
    }
  });
});

describe("detectHost — GPU detection integration", () => {
  it("includes GPU info when nvidia-smi succeeds", async () => {
    const run = mockRunner({
      "nvidia-smi": {
        stdout: "NVIDIA RTX 3090, 24576, 535.104.05",
        stderr: "",
        exitCode: 0,
        ok: true,
      },
    });

    const profile = await detectHost({ commandRunner: run });

    // GPU detection depends on platform; if running on linux, nvidia-smi is tried
    if (profile.os.platform.value === "linux") {
      expect(profile.gpu!.present.value).toBe(true);
      expect(profile.gpu!.model.value).toBe("NVIDIA RTX 3090");
    }
    // On other platforms, it might be unknown — that's fine
    expect(profile.gpu).not.toBeNull();
  });
});

describe("detectHost — confidence handling", () => {
  it("all fields have defined confidence levels", async () => {
    const profile = await detectHost({
      commandRunner: mockRunner({}),
    });

    // Verify confidence exists on all Detected fields
    expect(["certain", "estimated", "unknown"]).toContain(
      profile.os.platform.confidence,
    );
    expect(["certain", "estimated", "unknown"]).toContain(
      profile.cpu.model.confidence,
    );
    expect(["certain", "estimated", "unknown"]).toContain(
      profile.memory.totalGb.confidence,
    );

    if (profile.gpu) {
      expect(["certain", "estimated", "unknown"]).toContain(
        profile.gpu.present.confidence,
      );
    }
  });

  it("unknown values have null value", async () => {
    const profile = await detectHost({
      commandRunner: mockRunner({}),
    });

    // GPU on a CI box without nvidia-smi or system_profiler
    // All GPU fields should be unknown with null values
    if (profile.gpu && profile.gpu.present.confidence === "unknown") {
      expect(profile.gpu.present.value).toBeNull();
      expect(profile.gpu.model.value).toBeNull();
      expect(profile.gpu.vramGb.value).toBeNull();
    }
  });
});

describe("detectHost — never throws", () => {
  it("returns a profile even with a broken command runner", async () => {
    // A runner that always fails
    const brokenRunner = async () => ({
      stdout: "",
      stderr: "error",
      exitCode: null as number | null,
      ok: false,
    });

    const profile = await detectHost({
      commandRunner: brokenRunner,
    });

    // Should still have OS, CPU, memory (sync detectors)
    expect(profile.os.platform.confidence).toBe("certain");
    expect(profile.cpu.threads.confidence).toBe("certain");
    expect(profile.memory.totalGb.confidence).toBe("certain");
  });
});
