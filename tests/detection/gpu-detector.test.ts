/**
 * Tests for GPU detector.
 *
 * All detection is tested through parsing functions and the detectGpu
 * orchestrator with a mock command runner — no real GPU required.
 */

import { describe, it, expect } from "vitest";
import {
  parseNvidiaSmiCsv,
  parseSystemProfiler,
  unknownGpu,
  detectGpu,
} from "../../src/detection/gpu-detector.js";
import { mockRunner } from "./run-command.test.js";

// ---------------------------------------------------------------------------
// parseNvidiaSmiCsv
// ---------------------------------------------------------------------------

describe("parseNvidiaSmiCsv", () => {
  it("parses standard nvidia-smi CSV output", () => {
    const stdout = "NVIDIA GeForce RTX 4090, 24564, 550.54.14";
    const gpu = parseNvidiaSmiCsv(stdout);

    expect(gpu.present.value).toBe(true);
    expect(gpu.present.confidence).toBe("certain");
    expect(gpu.model.value).toBe("NVIDIA GeForce RTX 4090");
    expect(gpu.model.confidence).toBe("certain");
    expect(gpu.vramGb.value).toBeCloseTo(24.0, 0); // 24564 MB ≈ 24 GB
    expect(gpu.vramGb.confidence).toBe("certain");
    expect(gpu.driverVersion.value).toBe("550.54.14");
    expect(gpu.driverVersion.confidence).toBe("certain");
  });

  it("parses output with different GPU model", () => {
    const stdout = "NVIDIA A100-SXM4-80GB, 81920, 535.104.05";
    const gpu = parseNvidiaSmiCsv(stdout);

    expect(gpu.model.value).toBe("NVIDIA A100-SXM4-80GB");
    expect(gpu.vramGb.value).toBe(80); // 81920 MB = 80 GB
  });

  it("handles empty output", () => {
    const gpu = parseNvidiaSmiCsv("");

    expect(gpu.present.value).toBe(true); // nvidia-smi ran
    expect(gpu.model.confidence).toBe("unknown");
    expect(gpu.vramGb.confidence).toBe("unknown");
    expect(gpu.driverVersion.confidence).toBe("unknown");
  });

  it("handles partial CSV with missing fields", () => {
    const stdout = "NVIDIA RTX 3060, , ";
    const gpu = parseNvidiaSmiCsv(stdout);

    expect(gpu.model.value).toBe("NVIDIA RTX 3060");
    expect(gpu.vramGb.confidence).toBe("unknown");
    expect(gpu.driverVersion.confidence).toBe("unknown");
  });

  it("reports unknown fields correctly", () => {
    const gpu = parseNvidiaSmiCsv("Some GPU, 8192, 530.1");
    expect(gpu.cudaVersion.confidence).toBe("unknown");
    expect(gpu.rocmVersion.confidence).toBe("unknown");
  });

  it("handles multi-line output (takes first line)", () => {
    const stdout = "GPU 0, 24564, 550.1\nGPU 1, 16384, 550.1";
    const gpu = parseNvidiaSmiCsv(stdout);
    // Only first GPU is parsed in this phase
    expect(gpu.model.value).toBe("GPU 0");
  });
});

// ---------------------------------------------------------------------------
// parseSystemProfiler
// ---------------------------------------------------------------------------

describe("parseSystemProfiler", () => {
  it("parses Apple Silicon output", () => {
    const stdout = `
Graphics/Displays:
    Apple M2 Pro:
      Chipset Model: Apple M2 Pro
      Type: GPU
      Bus: Built-In
      Total Number of Cores: 19
      Vendor: Apple (0x106b)
      Metal Support: Metal 3
    `;

    const gpu = parseSystemProfiler(stdout);

    expect(gpu.present.value).toBe(true);
    expect(gpu.model.value).toBe("Apple M2 Pro");
    expect(gpu.model.confidence).toBe("certain");
    // VRAM not available for unified memory
    expect(gpu.vramGb.confidence).toBe("unknown");
    expect(gpu.cudaVersion.confidence).toBe("unknown");
  });

  it("parses output with VRAM in GB", () => {
    const stdout = `
Graphics/Displays:
    AMD Radeon Pro 5500M:
      Chipset Model: AMD Radeon Pro 5500M
      VRAM (Total): 8 GB
    `;

    const gpu = parseSystemProfiler(stdout);

    expect(gpu.model.value).toBe("AMD Radeon Pro 5500M");
    expect(gpu.vramGb.value).toBe(8);
    expect(gpu.vramGb.confidence).toBe("estimated");
  });

  it("parses output with VRAM in MB", () => {
    const stdout = `
      Chipset Model: Intel HD Graphics
      VRAM (Dynamic, Max): 1536 MB
    `;

    const gpu = parseSystemProfiler(stdout);

    expect(gpu.model.value).toBe("Intel HD Graphics");
    expect(gpu.vramGb.value).toBe(1.5); // 1536 MB → 1.5 GB
    expect(gpu.vramGb.confidence).toBe("estimated");
  });

  it("handles empty output", () => {
    const gpu = parseSystemProfiler("");

    expect(gpu.present.confidence).toBe("unknown");
    expect(gpu.model.confidence).toBe("unknown");
  });

  it("handles output with no Chipset Model", () => {
    const stdout = `
Graphics/Displays:
    Type: GPU
    `;

    const gpu = parseSystemProfiler(stdout);

    expect(gpu.present.confidence).toBe("unknown");
    expect(gpu.model.confidence).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// unknownGpu
// ---------------------------------------------------------------------------

describe("unknownGpu", () => {
  it("returns all fields as unknown", () => {
    const gpu = unknownGpu();

    expect(gpu.present.confidence).toBe("unknown");
    expect(gpu.present.value).toBeNull();
    expect(gpu.model.confidence).toBe("unknown");
    expect(gpu.vramGb.confidence).toBe("unknown");
    expect(gpu.cudaVersion.confidence).toBe("unknown");
    expect(gpu.rocmVersion.confidence).toBe("unknown");
    expect(gpu.driverVersion.confidence).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// detectGpu (with mock runner)
// ---------------------------------------------------------------------------

describe("detectGpu — orchestration", () => {
  it("uses nvidia-smi on linux", async () => {
    const run = mockRunner({
      "nvidia-smi": {
        stdout: "NVIDIA RTX 3080, 10240, 530.1",
        stderr: "",
        exitCode: 0,
        ok: true,
      },
    });

    const gpu = await detectGpu("linux", run);

    expect(gpu.present.value).toBe(true);
    expect(gpu.model.value).toBe("NVIDIA RTX 3080");
  });

  it("uses nvidia-smi on win32", async () => {
    const run = mockRunner({
      "nvidia-smi": {
        stdout: "NVIDIA RTX 4070, 12288, 545.2",
        stderr: "",
        exitCode: 0,
        ok: true,
      },
    });

    const gpu = await detectGpu("win32", run);

    expect(gpu.present.value).toBe(true);
  });

  it("uses system_profiler on darwin", async () => {
    const run = mockRunner({
      system_profiler: {
        stdout: "Chipset Model: Apple M1\n",
        stderr: "",
        exitCode: 0,
        ok: true,
      },
    });

    const gpu = await detectGpu("darwin", run);

    expect(gpu.model.value).toBe("Apple M1");
  });

  it("returns unknown when nvidia-smi is not available on linux", async () => {
    const run = mockRunner({}); // no commands available

    const gpu = await detectGpu("linux", run);

    expect(gpu.present.confidence).toBe("unknown");
  });

  it("returns unknown when system_profiler fails on darwin", async () => {
    const run = mockRunner({
      system_profiler: {
        stdout: "",
        stderr: "error",
        exitCode: 1,
        ok: false,
      },
    });

    const gpu = await detectGpu("darwin", run);

    expect(gpu.present.confidence).toBe("unknown");
  });

  it("returns unknown on unsupported platform", async () => {
    const run = mockRunner({});

    const gpu = await detectGpu("freebsd", run);

    expect(gpu.present.confidence).toBe("unknown");
  });
});
