/**
 * Tests for Runtime detector.
 *
 * Uses mock command runners to simulate runtime detection without
 * requiring the actual binaries to be installed.
 */

import { describe, it, expect } from "vitest";
import {
  extractVersion,
  detectSingleRuntime,
  detectRuntimes,
} from "../../src/detection/runtime-detector.js";
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

const ollamaRuntime = makeRuntime({
  id: "ollama",
  displayName: "Ollama",
  type: "local_server",
  detectionCommand: "ollama --version",
  versionCommand: "ollama --version",
  supportedPlatforms: ["linux", "darwin", "win32"],
});

const llamacppRuntime = makeRuntime({
  id: "llamacpp",
  displayName: "llama.cpp",
  type: "cli_tool",
  detectionCommand: "llama-server --version",
  versionCommand: "llama-server --version",
  supportedPlatforms: ["linux", "darwin"],
});

// ---------------------------------------------------------------------------
// extractVersion
// ---------------------------------------------------------------------------

describe("extractVersion", () => {
  it("extracts semver from 'ollama version 0.1.32'", () => {
    expect(extractVersion("ollama version 0.1.32")).toBe("0.1.32");
  });

  it("extracts semver from 'v0.1.32'", () => {
    expect(extractVersion("v0.1.32")).toBe("0.1.32");
  });

  it("extracts semver from '0.1.32'", () => {
    expect(extractVersion("0.1.32")).toBe("0.1.32");
  });

  it("extracts semver with pre-release tag", () => {
    expect(extractVersion("version 1.2.3-beta.1")).toBe("1.2.3-beta.1");
  });

  it("extracts build tag like b1234", () => {
    expect(extractVersion("llama-server version: b1234 (abc123)")).toBe(
      "b1234",
    );
  });

  it("returns null for no version info", () => {
    expect(extractVersion("no version here")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractVersion("")).toBeNull();
  });

  it("extracts from multi-line output", () => {
    const output = "Some header\nVersion: 2.3.4\nExtra info";
    expect(extractVersion(output)).toBe("2.3.4");
  });
});

// ---------------------------------------------------------------------------
// detectSingleRuntime
// ---------------------------------------------------------------------------

describe("detectSingleRuntime", () => {
  it("detects installed runtime with version", async () => {
    const run = mockRunner({
      ollama: {
        stdout: "ollama version 0.1.32",
        stderr: "",
        exitCode: 0,
        ok: true,
      },
    });

    const result = await detectSingleRuntime(ollamaRuntime, "linux", run);

    expect(result).not.toBeNull();
    expect(result!.runtimeId).toBe("ollama");
    expect(result!.version.value).toBe("0.1.32");
    expect(result!.version.confidence).toBe("estimated");
  });

  it("returns null when command is not found", async () => {
    const run = mockRunner({}); // no commands available

    const result = await detectSingleRuntime(ollamaRuntime, "linux", run);

    expect(result).toBeNull();
  });

  it("skips runtime on unsupported platform", async () => {
    // llamacpp doesn't support win32
    const run = mockRunner({
      "llama-server": {
        stdout: "v1.0.0",
        stderr: "",
        exitCode: 0,
        ok: true,
      },
    });

    const result = await detectSingleRuntime(llamacppRuntime, "win32", run);

    expect(result).toBeNull();
  });

  it("handles runtime that runs but has no parseable version", async () => {
    const run = mockRunner({
      ollama: {
        stdout: "ollama is running",
        stderr: "",
        exitCode: 0,
        ok: true,
      },
    });

    const result = await detectSingleRuntime(ollamaRuntime, "linux", run);

    expect(result).not.toBeNull();
    expect(result!.runtimeId).toBe("ollama");
    expect(result!.version.confidence).toBe("unknown");
    expect(result!.version.value).toBeNull();
  });

  it("extracts version from stderr when stdout is empty", async () => {
    const run = mockRunner({
      "llama-server": {
        stdout: "",
        stderr: "llama-server version b2345",
        exitCode: 0,
        ok: true,
      },
    });

    const result = await detectSingleRuntime(llamacppRuntime, "linux", run);

    expect(result).not.toBeNull();
    expect(result!.version.value).toBe("b2345");
  });

  it("detects runtime even with non-zero exit code if command ran", async () => {
    const run = mockRunner({
      ollama: {
        stdout: "ollama version 0.2.0",
        stderr: "warning: something",
        exitCode: 1,
        ok: false,
      },
    });

    const result = await detectSingleRuntime(ollamaRuntime, "darwin", run);

    // Command ran (exitCode is not null), so runtime is present
    expect(result).not.toBeNull();
    expect(result!.version.value).toBe("0.2.0");
  });
});

// ---------------------------------------------------------------------------
// detectRuntimes (aggregate)
// ---------------------------------------------------------------------------

describe("detectRuntimes", () => {
  it("detects multiple installed runtimes", async () => {
    const run = mockRunner({
      ollama: {
        stdout: "ollama version 0.1.32",
        stderr: "",
        exitCode: 0,
        ok: true,
      },
      "llama-server": {
        stdout: "v0.1.0",
        stderr: "",
        exitCode: 0,
        ok: true,
      },
    });

    const results = await detectRuntimes(
      [ollamaRuntime, llamacppRuntime],
      "linux",
      run,
    );

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.runtimeId).sort()).toEqual([
      "llamacpp",
      "ollama",
    ]);
  });

  it("returns only detected runtimes (skips missing)", async () => {
    const run = mockRunner({
      ollama: {
        stdout: "ollama version 0.1.32",
        stderr: "",
        exitCode: 0,
        ok: true,
      },
      // llama-server not available
    });

    const results = await detectRuntimes(
      [ollamaRuntime, llamacppRuntime],
      "linux",
      run,
    );

    expect(results).toHaveLength(1);
    expect(results[0].runtimeId).toBe("ollama");
  });

  it("returns empty array when no runtimes detected", async () => {
    const run = mockRunner({}); // no commands available

    const results = await detectRuntimes(
      [ollamaRuntime, llamacppRuntime],
      "linux",
      run,
    );

    expect(results).toHaveLength(0);
  });

  it("returns empty array for empty runtime list", async () => {
    const run = mockRunner({});

    const results = await detectRuntimes([], "linux", run);

    expect(results).toHaveLength(0);
  });

  it("respects platform filtering", async () => {
    const run = mockRunner({
      ollama: {
        stdout: "ollama version 0.1.32",
        stderr: "",
        exitCode: 0,
        ok: true,
      },
      "llama-server": {
        stdout: "v0.1.0",
        stderr: "",
        exitCode: 0,
        ok: true,
      },
    });

    // llamacpp doesn't support win32
    const results = await detectRuntimes(
      [ollamaRuntime, llamacppRuntime],
      "win32",
      run,
    );

    expect(results).toHaveLength(1);
    expect(results[0].runtimeId).toBe("ollama");
  });
});
