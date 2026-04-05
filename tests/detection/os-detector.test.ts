/**
 * Tests for OS detector.
 */

import { describe, it, expect } from "vitest";
import { parseOsInfo, detectOs } from "../../src/detection/os-detector.js";

describe("parseOsInfo", () => {
  it("wraps all values with certain confidence", () => {
    const info = parseOsInfo("linux", "5.15.0", "x64");
    expect(info.platform.value).toBe("linux");
    expect(info.platform.confidence).toBe("certain");
    expect(info.release.value).toBe("5.15.0");
    expect(info.release.confidence).toBe("certain");
    expect(info.arch.value).toBe("x64");
    expect(info.arch.confidence).toBe("certain");
  });

  it("handles darwin platform", () => {
    const info = parseOsInfo("darwin", "23.1.0", "arm64");
    expect(info.platform.value).toBe("darwin");
    expect(info.arch.value).toBe("arm64");
  });

  it("handles win32 platform", () => {
    const info = parseOsInfo("win32", "10.0.22621", "x64");
    expect(info.platform.value).toBe("win32");
  });

  it("includes source annotations", () => {
    const info = parseOsInfo("linux", "6.1.0", "x64");
    expect(info.platform.source).toContain("os.platform");
    expect(info.release.source).toContain("os.release");
    expect(info.arch.source).toContain("os.arch");
  });
});

describe("detectOs (live)", () => {
  it("returns a valid OsInfo from the real host", () => {
    const info = detectOs();
    // We're running on a real machine, so all values should be certain
    expect(info.platform.confidence).toBe("certain");
    expect(info.platform.value).toBeTruthy();
    expect(info.release.confidence).toBe("certain");
    expect(info.arch.confidence).toBe("certain");
  });
});
