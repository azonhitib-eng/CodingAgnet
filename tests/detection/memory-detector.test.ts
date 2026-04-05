/**
 * Tests for Memory detector.
 */

import { describe, it, expect } from "vitest";
import {
  parseMemoryInfo,
  bytesToGb,
  detectMemory,
} from "../../src/detection/memory-detector.js";

// ---------------------------------------------------------------------------
// bytesToGb
// ---------------------------------------------------------------------------

describe("bytesToGb", () => {
  it("converts 0 bytes to 0 GB", () => {
    expect(bytesToGb(0)).toBe(0);
  });

  it("converts 16 GiB to ~16 GB", () => {
    // 16 * 1024^3
    expect(bytesToGb(16 * 1024 ** 3)).toBe(16);
  });

  it("rounds to 1 decimal place", () => {
    // 1.5 * 1024^3 = 1610612736
    expect(bytesToGb(1.5 * 1024 ** 3)).toBe(1.5);
  });

  it("handles non-round values", () => {
    // 6.123... GB
    const bytes = 6.123 * 1024 ** 3;
    expect(bytesToGb(bytes)).toBe(6.1);
  });
});

// ---------------------------------------------------------------------------
// parseMemoryInfo
// ---------------------------------------------------------------------------

describe("parseMemoryInfo", () => {
  it("creates MemoryInfo with certain confidence", () => {
    const total = 32 * 1024 ** 3;
    const free = 16 * 1024 ** 3;
    const info = parseMemoryInfo(total, free);

    expect(info.totalGb.value).toBe(32);
    expect(info.totalGb.confidence).toBe("certain");
    expect(info.availableGb.value).toBe(16);
    expect(info.availableGb.confidence).toBe("certain");
  });

  it("includes source annotations", () => {
    const info = parseMemoryInfo(1024 ** 3, 1024 ** 3);

    expect(info.totalGb.source).toContain("os.totalmem");
    expect(info.availableGb.source).toContain("os.freemem");
  });

  it("handles zero memory", () => {
    const info = parseMemoryInfo(0, 0);

    expect(info.totalGb.value).toBe(0);
    expect(info.availableGb.value).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Live detection
// ---------------------------------------------------------------------------

describe("detectMemory (live)", () => {
  it("returns valid MemoryInfo from the real host", () => {
    const info = detectMemory();
    expect(info.totalGb.confidence).toBe("certain");
    expect(info.totalGb.value).toBeGreaterThan(0);
    expect(info.availableGb.confidence).toBe("certain");
  });
});
