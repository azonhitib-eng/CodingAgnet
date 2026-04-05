/**
 * Cross-platform detector parsing validation.
 *
 * Tests the GPU detector's parsing functions against realistic mocked
 * command outputs for Linux, macOS, and Windows scenarios.
 *
 * Covers:
 *   - NVIDIA-present cases (various GPUs)
 *   - No-GPU / fallback cases
 *   - Missing-command cases
 *   - Malformed command output cases
 *   - Uncertain / estimated fallback cases
 */

import { describe, it, expect } from "vitest";
import {
  parseNvidiaSmiCsv,
  parseSystemProfiler,
  unknownGpu,
  detectGpu,
} from "../../src/detection/gpu-detector.js";
import type { CommandRunner } from "../../src/detection/run-command.js";
import {
  NVIDIA_RTX_4090_CSV,
  NVIDIA_RTX_3060_CSV,
  NVIDIA_TESLA_V100_CSV,
  NVIDIA_GTX_1050TI_CSV,
  NVIDIA_MULTI_GPU_CSV,
  NVIDIA_MALFORMED_MISSING_FIELDS,
  NVIDIA_MALFORMED_EMPTY,
  NVIDIA_MALFORMED_GARBAGE,
  NVIDIA_MALFORMED_VRAM_NAN,
  MACOS_M2_PRO_PROFILER,
  MACOS_M1_NO_VRAM,
  MACOS_INTEL_IRIS,
  MACOS_MALFORMED_NO_CHIPSET,
  MACOS_MALFORMED_EMPTY,
  MISSING_COMMAND_RESULT,
  FAILED_COMMAND_RESULT,
  successResult,
} from "../fixtures/detector-outputs.js";

// ---------------------------------------------------------------------------
// nvidia-smi CSV parsing
// ---------------------------------------------------------------------------

describe("parseNvidiaSmiCsv", () => {
  it("parses RTX 4090 output correctly", () => {
    const gpu = parseNvidiaSmiCsv(NVIDIA_RTX_4090_CSV);
    expect(gpu.present.value).toBe(true);
    expect(gpu.present.confidence).toBe("certain");
    expect(gpu.model.value).toBe("NVIDIA GeForce RTX 4090");
    expect(gpu.model.confidence).toBe("certain");
    expect(gpu.vramGb.value).toBeCloseTo(24, 0);
    expect(gpu.vramGb.confidence).toBe("certain");
    expect(gpu.driverVersion.value).toBe("550.54.14");
  });

  it("parses RTX 3060 output correctly", () => {
    const gpu = parseNvidiaSmiCsv(NVIDIA_RTX_3060_CSV);
    expect(gpu.present.value).toBe(true);
    expect(gpu.model.value).toBe("NVIDIA GeForce RTX 3060");
    expect(gpu.vramGb.value).toBeCloseTo(12, 0);
    expect(gpu.driverVersion.value).toBe("535.183.01");
  });

  it("parses Tesla V100 datacenter GPU", () => {
    const gpu = parseNvidiaSmiCsv(NVIDIA_TESLA_V100_CSV);
    expect(gpu.present.value).toBe(true);
    expect(gpu.model.value).toBe("Tesla V100-SXM2-16GB");
    expect(gpu.vramGb.value).toBeCloseTo(16, 0);
    expect(gpu.driverVersion.value).toBe("525.85.12");
  });

  it("parses GTX 1050 Ti budget GPU", () => {
    const gpu = parseNvidiaSmiCsv(NVIDIA_GTX_1050TI_CSV);
    expect(gpu.present.value).toBe(true);
    expect(gpu.model.value).toBe("NVIDIA GeForce GTX 1050 Ti");
    expect(gpu.vramGb.value).toBeCloseTo(4, 0);
    expect(gpu.driverVersion.value).toBe("470.182.03");
  });

  it("handles multi-GPU output (takes first line)", () => {
    const gpu = parseNvidiaSmiCsv(NVIDIA_MULTI_GPU_CSV);
    expect(gpu.present.value).toBe(true);
    expect(gpu.model.value).toBe("NVIDIA GeForce RTX 4090");
    expect(gpu.vramGb.value).toBeCloseTo(24, 0);
  });

  it("handles missing fields gracefully", () => {
    const gpu = parseNvidiaSmiCsv(NVIDIA_MALFORMED_MISSING_FIELDS);
    expect(gpu.present.value).toBe(true);
    expect(gpu.model.value).toBe("NVIDIA GeForce RTX 4090");
    // VRAM and driver fields are missing → unknown
    expect(gpu.vramGb.confidence).toBe("unknown");
    expect(gpu.driverVersion.confidence).toBe("unknown");
  });

  it("handles empty output", () => {
    const gpu = parseNvidiaSmiCsv(NVIDIA_MALFORMED_EMPTY);
    expect(gpu.present.value).toBe(true);
    // Empty first line → all fields null/unknown
    expect(gpu.model.confidence).toBe("unknown");
    expect(gpu.vramGb.confidence).toBe("unknown");
    expect(gpu.driverVersion.confidence).toBe("unknown");
  });

  it("handles garbage error output", () => {
    const gpu = parseNvidiaSmiCsv(NVIDIA_MALFORMED_GARBAGE);
    // First line is error text — model is "ERROR: could not find GPU device"
    expect(gpu.present.value).toBe(true);
    expect(gpu.model.value).toBe("ERROR: could not find GPU device");
  });

  it("handles non-numeric VRAM value", () => {
    const gpu = parseNvidiaSmiCsv(NVIDIA_MALFORMED_VRAM_NAN);
    expect(gpu.present.value).toBe(true);
    expect(gpu.model.value).toBe("NVIDIA GeForce RTX 4090");
    expect(gpu.vramGb.confidence).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// macOS system_profiler parsing
// ---------------------------------------------------------------------------

describe("parseSystemProfiler", () => {
  it("parses Apple M2 Pro output correctly", () => {
    const gpu = parseSystemProfiler(MACOS_M2_PRO_PROFILER);
    expect(gpu.present.value).toBe(true);
    expect(gpu.present.confidence).toBe("certain");
    expect(gpu.model.value).toBe("Apple M2 Pro");
    expect(gpu.model.confidence).toBe("certain");
    expect(gpu.vramGb.value).toBe(22);
    expect(gpu.vramGb.confidence).toBe("estimated");
  });

  it("parses Apple M1 output with no VRAM line", () => {
    const gpu = parseSystemProfiler(MACOS_M1_NO_VRAM);
    expect(gpu.present.value).toBe(true);
    expect(gpu.model.value).toBe("Apple M1");
    expect(gpu.vramGb.confidence).toBe("unknown");
  });

  it("parses Intel Iris GPU with MB VRAM", () => {
    const gpu = parseSystemProfiler(MACOS_INTEL_IRIS);
    expect(gpu.present.value).toBe(true);
    expect(gpu.model.value).toBe("Intel Iris Plus Graphics 645");
    expect(gpu.vramGb.value).toBeCloseTo(1.5, 0);
    expect(gpu.vramGb.confidence).toBe("estimated");
  });

  it("handles missing Chipset Model line", () => {
    const gpu = parseSystemProfiler(MACOS_MALFORMED_NO_CHIPSET);
    expect(gpu.model.confidence).toBe("unknown");
    expect(gpu.present.confidence).toBe("unknown");
  });

  it("handles empty output", () => {
    const gpu = parseSystemProfiler(MACOS_MALFORMED_EMPTY);
    expect(gpu.model.confidence).toBe("unknown");
    expect(gpu.present.confidence).toBe("unknown");
    expect(gpu.vramGb.confidence).toBe("unknown");
  });

  it("always returns unknown for cudaVersion and rocmVersion on macOS", () => {
    const gpu = parseSystemProfiler(MACOS_M2_PRO_PROFILER);
    expect(gpu.cudaVersion.confidence).toBe("unknown");
    expect(gpu.rocmVersion.confidence).toBe("unknown");
    expect(gpu.driverVersion.confidence).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// Unknown GPU fallback
// ---------------------------------------------------------------------------

describe("unknownGpu", () => {
  it("returns all fields as unknown", () => {
    const gpu = unknownGpu();
    expect(gpu.present.confidence).toBe("unknown");
    expect(gpu.model.confidence).toBe("unknown");
    expect(gpu.vramGb.confidence).toBe("unknown");
    expect(gpu.cudaVersion.confidence).toBe("unknown");
    expect(gpu.rocmVersion.confidence).toBe("unknown");
    expect(gpu.driverVersion.confidence).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// detectGpu end-to-end with mocked CommandRunner
// ---------------------------------------------------------------------------

describe("detectGpu with mocked commands", () => {
  describe("Linux platform", () => {
    it("uses nvidia-smi when available", async () => {
      const run: CommandRunner = async (cmd) => {
        if (cmd === "nvidia-smi") return successResult(NVIDIA_RTX_4090_CSV);
        return MISSING_COMMAND_RESULT;
      };
      const gpu = await detectGpu("linux", run);
      expect(gpu.present.value).toBe(true);
      expect(gpu.model.value).toBe("NVIDIA GeForce RTX 4090");
    });

    it("returns unknown when nvidia-smi fails", async () => {
      const run: CommandRunner = async () => FAILED_COMMAND_RESULT;
      const gpu = await detectGpu("linux", run);
      expect(gpu.present.confidence).toBe("unknown");
    });

    it("returns unknown when nvidia-smi is missing", async () => {
      const run: CommandRunner = async () => MISSING_COMMAND_RESULT;
      const gpu = await detectGpu("linux", run);
      expect(gpu.present.confidence).toBe("unknown");
    });
  });

  describe("macOS (darwin) platform", () => {
    it("uses system_profiler when available", async () => {
      const run: CommandRunner = async (cmd) => {
        if (cmd === "system_profiler") return successResult(MACOS_M2_PRO_PROFILER);
        return MISSING_COMMAND_RESULT;
      };
      const gpu = await detectGpu("darwin", run);
      expect(gpu.present.value).toBe(true);
      expect(gpu.model.value).toBe("Apple M2 Pro");
    });

    it("returns unknown when system_profiler fails", async () => {
      const run: CommandRunner = async () => FAILED_COMMAND_RESULT;
      const gpu = await detectGpu("darwin", run);
      expect(gpu.present.confidence).toBe("unknown");
    });

    it("does not try nvidia-smi on macOS", async () => {
      let calledNvidiaSmi = false;
      const run: CommandRunner = async (cmd) => {
        if (cmd === "nvidia-smi") {
          calledNvidiaSmi = true;
          return successResult(NVIDIA_RTX_4090_CSV);
        }
        return MISSING_COMMAND_RESULT;
      };
      await detectGpu("darwin", run);
      expect(calledNvidiaSmi).toBe(false);
    });
  });

  describe("Windows (win32) platform", () => {
    it("uses nvidia-smi when available", async () => {
      const run: CommandRunner = async (cmd) => {
        if (cmd === "nvidia-smi") return successResult(NVIDIA_RTX_3060_CSV);
        return MISSING_COMMAND_RESULT;
      };
      const gpu = await detectGpu("win32", run);
      expect(gpu.present.value).toBe(true);
      expect(gpu.model.value).toBe("NVIDIA GeForce RTX 3060");
    });

    it("returns unknown when nvidia-smi is missing on Windows", async () => {
      const run: CommandRunner = async () => MISSING_COMMAND_RESULT;
      const gpu = await detectGpu("win32", run);
      expect(gpu.present.confidence).toBe("unknown");
    });

    it("does not try system_profiler on Windows", async () => {
      let calledProfiler = false;
      const run: CommandRunner = async (cmd) => {
        if (cmd === "system_profiler") {
          calledProfiler = true;
          return successResult(MACOS_M2_PRO_PROFILER);
        }
        return MISSING_COMMAND_RESULT;
      };
      await detectGpu("win32", run);
      expect(calledProfiler).toBe(false);
    });
  });

  describe("unsupported platform", () => {
    it("returns unknown GPU for unrecognized platform", async () => {
      const run: CommandRunner = async () => successResult("some output");
      const gpu = await detectGpu("freebsd", run);
      expect(gpu.present.confidence).toBe("unknown");
    });
  });
});
