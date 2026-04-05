/**
 * Tests for CPU detector.
 */

import { describe, it, expect } from "vitest";
import type os from "node:os";
import {
  parseCpuInfo,
  estimateCores,
  detectCpu,
} from "../../src/detection/cpu-detector.js";

// ---------------------------------------------------------------------------
// estimateCores
// ---------------------------------------------------------------------------

describe("estimateCores", () => {
  it("returns 1 for 1 thread", () => {
    expect(estimateCores(1)).toBe(1);
  });

  it("returns half for even thread counts", () => {
    expect(estimateCores(8)).toBe(4);
    expect(estimateCores(16)).toBe(8);
  });

  it("rounds up for odd thread counts", () => {
    expect(estimateCores(3)).toBe(2);
    expect(estimateCores(5)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// parseCpuInfo
// ---------------------------------------------------------------------------

describe("parseCpuInfo", () => {
  it("parses a typical multi-core CPU", () => {
    const mockCpus: os.CpuInfo[] = Array.from({ length: 8 }, () => ({
      model: "Intel(R) Core(TM) i7-10700 CPU @ 2.90GHz",
      speed: 2900,
      times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
    }));

    const info = parseCpuInfo(mockCpus);

    expect(info.model.value).toBe("Intel(R) Core(TM) i7-10700 CPU @ 2.90GHz");
    expect(info.model.confidence).toBe("certain");
    expect(info.threads.value).toBe(8);
    expect(info.threads.confidence).toBe("certain");
    expect(info.cores.value).toBe(4); // estimated
    expect(info.cores.confidence).toBe("estimated");
  });

  it("parses a single-core CPU", () => {
    const mockCpus: os.CpuInfo[] = [
      {
        model: "ARM v7l",
        speed: 1200,
        times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
      },
    ];

    const info = parseCpuInfo(mockCpus);

    expect(info.threads.value).toBe(1);
    expect(info.cores.value).toBe(1);
  });

  it("handles empty CPU array gracefully", () => {
    const info = parseCpuInfo([]);

    expect(info.model.confidence).toBe("unknown");
    expect(info.model.value).toBeNull();
    expect(info.cores.confidence).toBe("unknown");
    expect(info.threads.confidence).toBe("unknown");
  });

  it("handles empty model string", () => {
    const mockCpus: os.CpuInfo[] = [
      {
        model: "",
        speed: 0,
        times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
      },
    ];

    const info = parseCpuInfo(mockCpus);

    expect(info.model.confidence).toBe("unknown");
    expect(info.model.value).toBeNull();
    expect(info.threads.value).toBe(1); // still certain — 1 entry
  });

  it("includes source annotations", () => {
    const mockCpus: os.CpuInfo[] = [
      {
        model: "Test CPU",
        speed: 3000,
        times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
      },
      {
        model: "Test CPU",
        speed: 3000,
        times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
      },
    ];

    const info = parseCpuInfo(mockCpus);

    expect(info.model.source).toContain("os.cpus()");
    expect(info.threads.source).toContain("os.cpus()");
    expect(info.cores.source).toContain("estimated");
  });
});

describe("detectCpu (live)", () => {
  it("returns a valid CpuInfo from the real host", () => {
    const info = detectCpu();
    // Running on a real machine, threads should be certain and > 0
    expect(info.threads.confidence).toBe("certain");
    expect(info.threads.value).toBeGreaterThan(0);
    expect(info.cores.confidence).toBe("estimated");
  });
});
