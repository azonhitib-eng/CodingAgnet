/**
 * Deterministic host profile fixtures for cross-platform validation.
 *
 * These fixtures represent realistic hardware classes and are used
 * throughout the test suite to ensure compatibility, recommendation,
 * planning, and workflow behavior remain stable and reproducible.
 *
 * Each profile is a frozen HostProfile with realistic detection
 * confidence levels matching what real detectors would produce.
 *
 * Profiles:
 *   - lowEndCpuOnly:       Budget laptop, no GPU, limited RAM
 *   - midRangeGpu:         Developer workstation, mid-tier GPU
 *   - highEndGpu:          ML workstation, high-end GPU
 *   - missingRuntime:      Good hardware, no runtimes installed
 *   - partiallyUnknown:    Mixed confidence levels, some unknown values
 *   - unsupportedWeak:     Extremely low resources, unsupported
 */

import type { HostProfile, GpuInfo } from "../../src/types/host.js";

// ---------------------------------------------------------------------------
// Helper: build Detected wrappers
// ---------------------------------------------------------------------------

function certain<T>(value: T, source?: string) {
  return { value, confidence: "certain" as const, source };
}

function estimated<T>(value: T, source?: string) {
  return { value, confidence: "estimated" as const, source };
}

function unknown<T>(source?: string) {
  return { value: null as T | null, confidence: "unknown" as const, source };
}

// ---------------------------------------------------------------------------
// Fixture: Low-end CPU-only machine
// ---------------------------------------------------------------------------

/**
 * Budget laptop: 8 GB RAM, no GPU, 4 threads.
 * Ollama installed but no GPU acceleration.
 * Should classify most models as cpu_only_slow or unsupported.
 */
export const lowEndCpuOnly: Readonly<HostProfile> = Object.freeze({
  detectedAt: "2025-01-15T10:00:00Z",
  os: {
    platform: certain("linux", "os.platform()"),
    release: certain("6.1.0-generic", "os.release()"),
    arch: certain("x64", "os.arch()"),
  },
  cpu: {
    model: certain("Intel(R) Celeron(R) N5105 @ 2.00GHz", "os.cpus()"),
    cores: estimated(2, "threads/2 heuristic"),
    threads: certain(4, "os.cpus().length"),
  },
  memory: {
    totalGb: certain(8, "os.totalmem()"),
    availableGb: certain(5.2, "os.freemem()"),
  },
  gpu: null,
  installedRuntimes: [
    { runtimeId: "ollama", version: certain("0.3.12", "ollama --version") },
  ],
  missingDependencies: ["llama-cpp"],
});

// ---------------------------------------------------------------------------
// Fixture: Mid-range GPU machine
// ---------------------------------------------------------------------------

/**
 * Developer workstation: 32 GB RAM, RTX 3060 12GB, 16 threads.
 * Both runtimes installed.
 * Should fully support small models, support_with_limits for large.
 */
export const midRangeGpu: Readonly<HostProfile> = Object.freeze({
  detectedAt: "2025-01-15T10:00:00Z",
  os: {
    platform: certain("linux", "os.platform()"),
    release: certain("6.5.0-generic", "os.release()"),
    arch: certain("x64", "os.arch()"),
  },
  cpu: {
    model: certain("AMD Ryzen 7 5800X 8-Core Processor", "os.cpus()"),
    cores: estimated(8, "threads/2 heuristic"),
    threads: certain(16, "os.cpus().length"),
  },
  memory: {
    totalGb: certain(32, "os.totalmem()"),
    availableGb: certain(24.5, "os.freemem()"),
  },
  gpu: Object.freeze({
    present: certain(true, "nvidia-smi"),
    model: certain("NVIDIA GeForce RTX 3060", "nvidia-smi --query-gpu=name"),
    vramGb: certain(12, "nvidia-smi --query-gpu=memory.total"),
    cudaVersion: unknown("not queried in this phase"),
    rocmVersion: unknown("not applicable for NVIDIA"),
    driverVersion: certain("535.183.01", "nvidia-smi --query-gpu=driver_version"),
  }) as GpuInfo,
  installedRuntimes: [
    { runtimeId: "ollama", version: certain("0.4.1", "ollama --version") },
    { runtimeId: "llama-cpp", version: certain("b3200", "llama-server --version") },
  ],
  missingDependencies: [],
});

// ---------------------------------------------------------------------------
// Fixture: High-end GPU machine
// ---------------------------------------------------------------------------

/**
 * ML workstation: 64 GB RAM, RTX 4090 24GB, 32 threads.
 * Both runtimes installed.
 * Should fully support almost all models.
 */
export const highEndGpu: Readonly<HostProfile> = Object.freeze({
  detectedAt: "2025-01-15T10:00:00Z",
  os: {
    platform: certain("linux", "os.platform()"),
    release: certain("6.8.0-generic", "os.release()"),
    arch: certain("x64", "os.arch()"),
  },
  cpu: {
    model: certain("AMD Ryzen 9 7950X 16-Core Processor", "os.cpus()"),
    cores: estimated(16, "threads/2 heuristic"),
    threads: certain(32, "os.cpus().length"),
  },
  memory: {
    totalGb: certain(64, "os.totalmem()"),
    availableGb: certain(52.3, "os.freemem()"),
  },
  gpu: Object.freeze({
    present: certain(true, "nvidia-smi"),
    model: certain("NVIDIA GeForce RTX 4090", "nvidia-smi --query-gpu=name"),
    vramGb: certain(24, "nvidia-smi --query-gpu=memory.total"),
    cudaVersion: unknown("not queried in this phase"),
    rocmVersion: unknown("not applicable for NVIDIA"),
    driverVersion: certain("550.54.14", "nvidia-smi --query-gpu=driver_version"),
  }) as GpuInfo,
  installedRuntimes: [
    { runtimeId: "ollama", version: certain("0.4.5", "ollama --version") },
    { runtimeId: "llama-cpp", version: certain("b3500", "llama-server --version") },
  ],
  missingDependencies: [],
});

// ---------------------------------------------------------------------------
// Fixture: Missing-runtime machine
// ---------------------------------------------------------------------------

/**
 * Decent hardware but no runtimes installed.
 * Should classify as unsupported (runtime_missing) for all artifacts.
 */
export const missingRuntime: Readonly<HostProfile> = Object.freeze({
  detectedAt: "2025-01-15T10:00:00Z",
  os: {
    platform: certain("darwin", "os.platform()"),
    release: certain("23.4.0", "os.release()"),
    arch: certain("arm64", "os.arch()"),
  },
  cpu: {
    model: certain("Apple M2 Pro", "os.cpus()"),
    cores: estimated(10, "threads/2 heuristic"),
    threads: certain(20, "os.cpus().length"),
  },
  memory: {
    totalGb: certain(32, "os.totalmem()"),
    availableGb: certain(18.5, "os.freemem()"),
  },
  gpu: Object.freeze({
    present: certain(true, "system_profiler"),
    model: certain("Apple M2 Pro", "system_profiler Chipset Model"),
    vramGb: estimated(16, "system_profiler VRAM"),
    cudaVersion: unknown("not applicable for macOS"),
    rocmVersion: unknown("not applicable for macOS"),
    driverVersion: unknown("not separately versioned on macOS"),
  }) as GpuInfo,
  installedRuntimes: [],
  missingDependencies: ["ollama", "llama-cpp"],
});

// ---------------------------------------------------------------------------
// Fixture: Partially unknown / uncertain machine
// ---------------------------------------------------------------------------

/**
 * Some detection succeeded, some failed.
 * GPU present but VRAM unknown, RAM estimated, arch unknown.
 * Tests the system's behavior under partial uncertainty.
 */
export const partiallyUnknown: Readonly<HostProfile> = Object.freeze({
  detectedAt: "2025-01-15T10:00:00Z",
  os: {
    platform: certain("linux", "os.platform()"),
    release: certain("5.15.0-generic", "os.release()"),
    arch: unknown("os.arch() failed"),
  },
  cpu: {
    model: estimated("Unknown x86_64 Processor", "fallback"),
    cores: unknown("detection failed"),
    threads: estimated(8, "approximate from /proc/cpuinfo"),
  },
  memory: {
    totalGb: estimated(16, "approximate from /proc/meminfo"),
    availableGb: estimated(10, "approximate from /proc/meminfo"),
  },
  gpu: Object.freeze({
    present: estimated(true, "lspci suggests GPU present"),
    model: unknown("nvidia-smi failed"),
    vramGb: unknown("nvidia-smi failed"),
    cudaVersion: unknown("nvidia-smi failed"),
    rocmVersion: unknown("rocminfo failed"),
    driverVersion: unknown("nvidia-smi failed"),
  }) as GpuInfo,
  installedRuntimes: [
    { runtimeId: "ollama", version: estimated("0.3.x", "approximate from output") },
  ],
  missingDependencies: ["llama-cpp"],
});

// ---------------------------------------------------------------------------
// Fixture: Unsupported / weak machine
// ---------------------------------------------------------------------------

/**
 * Extremely weak: 2 GB RAM, no GPU, 2 threads.
 * Below minimum requirements for virtually all models.
 * Should be unsupported for everything.
 */
export const unsupportedWeak: Readonly<HostProfile> = Object.freeze({
  detectedAt: "2025-01-15T10:00:00Z",
  os: {
    platform: certain("linux", "os.platform()"),
    release: certain("5.4.0-generic", "os.release()"),
    arch: certain("x64", "os.arch()"),
  },
  cpu: {
    model: certain("Intel(R) Atom(TM) x5-Z8350 @ 1.44GHz", "os.cpus()"),
    cores: estimated(2, "threads/2 heuristic"),
    threads: certain(2, "os.cpus().length"),
  },
  memory: {
    totalGb: certain(2, "os.totalmem()"),
    availableGb: certain(0.8, "os.freemem()"),
  },
  gpu: null,
  installedRuntimes: [
    { runtimeId: "ollama", version: certain("0.2.0", "ollama --version") },
  ],
  missingDependencies: ["llama-cpp"],
});

// ---------------------------------------------------------------------------
// All profiles as a named map for iteration
// ---------------------------------------------------------------------------

export const ALL_FIXTURE_PROFILES = {
  lowEndCpuOnly,
  midRangeGpu,
  highEndGpu,
  missingRuntime,
  partiallyUnknown,
  unsupportedWeak,
} as const;

export type FixtureProfileName = keyof typeof ALL_FIXTURE_PROFILES;
