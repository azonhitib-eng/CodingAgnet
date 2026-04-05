/**
 * CLI tests — host-loader (deterministic host input).
 *
 * Tests loading HostProfile from JSON files with validation,
 * covering happy path, malformed JSON, missing files, and
 * schema validation errors.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { loadHostProfile, validateHostProfile } from "../../src/cli/host-loader.js";
import { CliError } from "../../src/cli/errors.js";
import type { HostProfile, Detected } from "../../src/types/index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TMP_DIR = join(import.meta.dirname, "../../tmp-host-loader-test");

function certain<T>(value: T): Detected<T> {
  return { value, confidence: "certain" };
}

function unknown<T>(): Detected<T> {
  return { value: null, confidence: "unknown" };
}

function makeHostData(): HostProfile {
  return {
    detectedAt: "2025-01-01T00:00:00Z",
    os: {
      platform: certain("linux"),
      release: certain("6.1.0"),
      arch: certain("x64"),
    },
    cpu: {
      model: certain("AMD Ryzen 9 7950X"),
      cores: certain(16),
      threads: certain(32),
    },
    memory: {
      totalGb: certain(64),
      availableGb: certain(48),
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
      { runtimeId: "ollama", version: certain("0.3.0") },
    ],
    missingDependencies: [],
  };
}

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterAll(() => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

// ---------------------------------------------------------------------------
// loadHostProfile — happy path
// ---------------------------------------------------------------------------

describe("loadHostProfile — valid files", () => {
  it("loads a valid host profile from a JSON file", () => {
    const filePath = join(TMP_DIR, "valid-host.json");
    const hostData = makeHostData();
    writeFileSync(filePath, JSON.stringify(hostData, null, 2));

    const loaded = loadHostProfile(filePath);
    expect(loaded.detectedAt).toBe("2025-01-01T00:00:00Z");
    expect(loaded.os.platform.value).toBe("linux");
    expect(loaded.cpu.cores.value).toBe(16);
    expect(loaded.memory.totalGb.value).toBe(64);
    expect(loaded.gpu?.present.value).toBe(true);
    expect(loaded.installedRuntimes).toHaveLength(1);
    expect(loaded.installedRuntimes[0].runtimeId).toBe("ollama");
  });

  it("loads host profile with null GPU", () => {
    const filePath = join(TMP_DIR, "no-gpu-host.json");
    const hostData = makeHostData();
    hostData.gpu = null;
    writeFileSync(filePath, JSON.stringify(hostData, null, 2));

    const loaded = loadHostProfile(filePath);
    expect(loaded.gpu).toBeNull();
  });

  it("loads host profile with empty runtimes", () => {
    const filePath = join(TMP_DIR, "no-runtimes-host.json");
    const hostData = makeHostData();
    hostData.installedRuntimes = [];
    hostData.missingDependencies = ["ollama"];
    writeFileSync(filePath, JSON.stringify(hostData, null, 2));

    const loaded = loadHostProfile(filePath);
    expect(loaded.installedRuntimes).toHaveLength(0);
    expect(loaded.missingDependencies).toContain("ollama");
  });

  it("loads host profile with estimated confidence values", () => {
    const filePath = join(TMP_DIR, "estimated-host.json");
    const hostData = makeHostData();
    hostData.cpu.model = { value: "Unknown CPU", confidence: "estimated" };
    hostData.memory.availableGb = { value: 30, confidence: "estimated", source: "parsed from /proc/meminfo" };
    writeFileSync(filePath, JSON.stringify(hostData, null, 2));

    const loaded = loadHostProfile(filePath);
    expect(loaded.cpu.model.confidence).toBe("estimated");
    expect(loaded.memory.availableGb.source).toBe("parsed from /proc/meminfo");
  });
});

// ---------------------------------------------------------------------------
// loadHostProfile — error cases
// ---------------------------------------------------------------------------

describe("loadHostProfile — error handling", () => {
  it("throws CliError for missing file", () => {
    expect(() => loadHostProfile("/nonexistent/path/host.json")).toThrow(CliError);
    try {
      loadHostProfile("/nonexistent/path/host.json");
    } catch (e) {
      expect((e as CliError).message).toContain("Cannot read host file");
    }
  });

  it("throws CliError for invalid JSON", () => {
    const filePath = join(TMP_DIR, "bad-json.json");
    writeFileSync(filePath, "not valid json {{{");

    expect(() => loadHostProfile(filePath)).toThrow(CliError);
    try {
      loadHostProfile(filePath);
    } catch (e) {
      expect((e as CliError).message).toContain("Invalid JSON");
    }
  });

  it("throws CliError for empty object", () => {
    const filePath = join(TMP_DIR, "empty-object.json");
    writeFileSync(filePath, JSON.stringify({}));

    expect(() => loadHostProfile(filePath)).toThrow(CliError);
    try {
      loadHostProfile(filePath);
    } catch (e) {
      expect((e as CliError).message).toContain("validation failed");
    }
  });

  it("throws CliError for missing required fields", () => {
    const filePath = join(TMP_DIR, "partial-host.json");
    writeFileSync(filePath, JSON.stringify({
      detectedAt: "2025-01-01T00:00:00Z",
      os: { platform: certain("linux") },
      // missing cpu, memory, etc.
    }));

    expect(() => loadHostProfile(filePath)).toThrow(CliError);
    try {
      loadHostProfile(filePath);
    } catch (e) {
      expect((e as CliError).message).toContain("validation failed");
    }
  });

  it("throws CliError for invalid confidence value", () => {
    const filePath = join(TMP_DIR, "bad-confidence.json");
    const hostData = makeHostData();
    (hostData.os.platform as Record<string, unknown>).confidence = "maybe";
    writeFileSync(filePath, JSON.stringify(hostData));

    expect(() => loadHostProfile(filePath)).toThrow(CliError);
    try {
      loadHostProfile(filePath);
    } catch (e) {
      expect((e as CliError).message).toContain("validation failed");
    }
  });

  it("throws CliError for non-null value with unknown confidence", () => {
    const filePath = join(TMP_DIR, "bad-unknown-value.json");
    const hostData = makeHostData();
    hostData.cpu.cores = { value: 8, confidence: "unknown" };
    writeFileSync(filePath, JSON.stringify(hostData));

    expect(() => loadHostProfile(filePath)).toThrow(CliError);
    try {
      loadHostProfile(filePath);
    } catch (e) {
      expect((e as CliError).message).toContain("validation failed");
    }
  });

  it("throws CliError for invalid datetime format", () => {
    const filePath = join(TMP_DIR, "bad-datetime.json");
    const hostData = makeHostData();
    hostData.detectedAt = "not-a-date";
    writeFileSync(filePath, JSON.stringify(hostData));

    expect(() => loadHostProfile(filePath)).toThrow(CliError);
  });

  it("CliError has EXIT_INPUT exit code", () => {
    const filePath = join(TMP_DIR, "for-exit-code.json");
    writeFileSync(filePath, "invalid");

    try {
      loadHostProfile(filePath);
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).exitCode).toBe(2); // EXIT_INPUT
    }
  });
});

// ---------------------------------------------------------------------------
// validateHostProfile — programmatic API
// ---------------------------------------------------------------------------

describe("validateHostProfile — programmatic validation", () => {
  it("returns valid HostProfile for correct data", () => {
    const hostData = makeHostData();
    const result = validateHostProfile(hostData);
    expect(result.os.platform.value).toBe("linux");
    expect(result.detectedAt).toBe("2025-01-01T00:00:00Z");
  });

  it("throws Error (not CliError) for invalid data", () => {
    expect(() => validateHostProfile({})).toThrow(Error);
    expect(() => validateHostProfile({})).not.toThrow(CliError);
  });

  it("error message describes validation issues", () => {
    try {
      validateHostProfile({ detectedAt: "bad" });
      expect.fail("Should have thrown");
    } catch (e) {
      expect((e as Error).message).toContain("validation failed");
    }
  });

  it("validates nested Detected<T> structures", () => {
    const hostData = makeHostData();
    hostData.memory.totalGb = { value: -1, confidence: "certain" };
    expect(() => validateHostProfile(hostData)).toThrow();
  });
});
