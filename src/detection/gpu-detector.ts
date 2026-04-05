/**
 * GPU detector.
 *
 * Best-effort GPU detection.  Strategies:
 *
 * 1. **NVIDIA** — run `nvidia-smi` and parse XML output.
 *    Works on Linux and Windows when NVIDIA drivers are installed.
 *
 * 2. **macOS** — run `system_profiler SPDisplaysDataType` and parse
 *    the text output.  VRAM may not be available for Apple Silicon
 *    (unified memory), so it falls back to unknown.
 *
 * 3. **Fallback** — return unknown GPU info.
 *
 * Command execution is injected so tests can provide mock output.
 */

import type { GpuInfo, Detected } from "../types/host.js";
import type { CommandRunner } from "./run-command.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function certain<T>(value: T, source: string): Detected<T> {
  return { value, confidence: "certain", source };
}

function estimated<T>(value: T, source: string): Detected<T> {
  return { value, confidence: "estimated", source };
}

function unknown<T>(source: string): Detected<T> {
  return { value: null, confidence: "unknown", source } as Detected<T>;
}

// ---------------------------------------------------------------------------
// nvidia-smi parsing
// ---------------------------------------------------------------------------

/**
 * Parse `nvidia-smi --query-gpu=...` CSV output.
 *
 * We use the simpler CSV query format:
 *   nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits
 *
 * Example output:
 *   "NVIDIA GeForce RTX 4090, 24564, 550.54.14"
 */
export function parseNvidiaSmiCsv(stdout: string): GpuInfo {
  const line = stdout.trim().split("\n")[0] ?? "";
  const parts = line.split(",").map((s) => s.trim());

  const model = parts[0] || null;
  const vramMb = parts[1] ? parseFloat(parts[1]) : null;
  const driver = parts[2] || null;

  return {
    present: certain(true, "nvidia-smi"),
    model: model
      ? certain(model, "nvidia-smi --query-gpu=name")
      : unknown("nvidia-smi name field empty"),
    vramGb:
      vramMb !== null && !isNaN(vramMb)
        ? certain(
            Math.round((vramMb / 1024) * 10) / 10,
            "nvidia-smi --query-gpu=memory.total",
          )
        : unknown("nvidia-smi memory.total parse failed"),
    cudaVersion: unknown("not queried in this phase"),
    rocmVersion: unknown("not applicable for NVIDIA"),
    driverVersion: driver
      ? certain(driver, "nvidia-smi --query-gpu=driver_version")
      : unknown("nvidia-smi driver_version field empty"),
  };
}

// ---------------------------------------------------------------------------
// macOS system_profiler parsing
// ---------------------------------------------------------------------------

/**
 * Parse `system_profiler SPDisplaysDataType` text output.
 *
 * Example fragment:
 *   Graphics/Displays:
 *       Apple M2 Pro:
 *         Chipset Model: Apple M2 Pro
 *         VRAM (Dynamic, Max): 22 GB
 *         ...
 */
export function parseSystemProfiler(stdout: string): GpuInfo {
  const chipsetMatch = stdout.match(/Chipset Model:\s*(.+)/i);
  const vramMatch = stdout.match(/VRAM[^:]*:\s*([\d.]+)\s*(?:GB|MB)/i);
  const vramUnit = stdout.match(/VRAM[^:]*:\s*[\d.]+\s*(GB|MB)/i);

  const model = chipsetMatch?.[1]?.trim() ?? null;
  let vramGb: number | null = null;
  if (vramMatch) {
    const raw = parseFloat(vramMatch[1]);
    if (!isNaN(raw)) {
      vramGb =
        vramUnit?.[1]?.toUpperCase() === "MB"
          ? Math.round((raw / 1024) * 10) / 10
          : raw;
    }
  }

  return {
    present: model ? certain(true, "system_profiler") : unknown("system_profiler"),
    model: model
      ? certain(model, "system_profiler Chipset Model")
      : unknown("system_profiler Chipset Model not found"),
    vramGb:
      vramGb !== null
        ? estimated(vramGb, "system_profiler VRAM")
        : unknown("system_profiler VRAM not found (may be unified memory)"),
    cudaVersion: unknown("not applicable for macOS"),
    rocmVersion: unknown("not applicable for macOS"),
    driverVersion: unknown("not separately versioned on macOS"),
  };
}

// ---------------------------------------------------------------------------
// Unknown fallback
// ---------------------------------------------------------------------------

export function unknownGpu(): GpuInfo {
  return {
    present: unknown("no GPU detection method succeeded"),
    model: unknown("no GPU detection method succeeded"),
    vramGb: unknown("no GPU detection method succeeded"),
    cudaVersion: unknown("no GPU detection method succeeded"),
    rocmVersion: unknown("no GPU detection method succeeded"),
    driverVersion: unknown("no GPU detection method succeeded"),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect GPU information.
 *
 * @param platform - The OS platform string (e.g. "linux", "darwin", "win32").
 * @param run - Command runner (injected for testability).
 */
export async function detectGpu(
  platform: string,
  run: CommandRunner,
): Promise<GpuInfo> {
  // 1. Try nvidia-smi (works on linux, win32, and sometimes darwin)
  if (platform === "linux" || platform === "win32") {
    const result = await run("nvidia-smi", [
      "--query-gpu=name,memory.total,driver_version",
      "--format=csv,noheader,nounits",
    ]);
    if (result.ok && result.stdout) {
      return parseNvidiaSmiCsv(result.stdout);
    }
  }

  // 2. macOS — system_profiler
  if (platform === "darwin") {
    const result = await run("system_profiler", ["SPDisplaysDataType"]);
    if (result.ok && result.stdout) {
      return parseSystemProfiler(result.stdout);
    }
  }

  // 3. Fallback
  return unknownGpu();
}
