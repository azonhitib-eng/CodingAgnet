/**
 * Host capability type contracts.
 *
 * Host detection produces uncertain data — not every value can be
 * determined reliably on every platform.  Each detected value carries
 * a confidence level.
 */

// ---------------------------------------------------------------------------
// Confidence wrapper
// ---------------------------------------------------------------------------

/** How much we trust a detected value. */
export type Confidence = "certain" | "estimated" | "unknown";

/**
 * A detected value that may be uncertain.
 * - `certain`   — authoritative (e.g. os.platform())
 * - `estimated` — best-effort parse from unreliable source
 * - `unknown`   — detection failed; value is null
 */
export interface Detected<T> {
  value: T | null;
  confidence: Confidence;
  /** Optional note explaining how the value was obtained. */
  source?: string;
}

// ---------------------------------------------------------------------------
// Sub-profiles
// ---------------------------------------------------------------------------

export interface OsInfo {
  platform: Detected<string>;
  release: Detected<string>;
  arch: Detected<string>;
}

export interface CpuInfo {
  model: Detected<string>;
  cores: Detected<number>;
  threads: Detected<number>;
}

export interface MemoryInfo {
  totalGb: Detected<number>;
  availableGb: Detected<number>;
}

export interface GpuInfo {
  present: Detected<boolean>;
  model: Detected<string>;
  vramGb: Detected<number>;
  cudaVersion: Detected<string>;
  rocmVersion: Detected<string>;
  driverVersion: Detected<string>;
}

export interface InstalledRuntime {
  runtimeId: string;
  version: Detected<string>;
}

// ---------------------------------------------------------------------------
// Aggregate host profile
// ---------------------------------------------------------------------------

export interface HostProfile {
  /** When the detection was performed (ISO-8601). */
  detectedAt: string;
  os: OsInfo;
  cpu: CpuInfo;
  memory: MemoryInfo;
  gpu: GpuInfo | null;
  installedRuntimes: InstalledRuntime[];
  missingDependencies: string[];
}
