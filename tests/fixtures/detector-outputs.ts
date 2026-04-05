/**
 * Realistic mocked command outputs for cross-platform detector validation.
 *
 * These fixtures represent actual command outputs that the detection layer
 * would encounter on different platforms, including success cases, missing
 * commands, and malformed output edge cases.
 */

// ---------------------------------------------------------------------------
// nvidia-smi outputs (Linux / Windows)
// ---------------------------------------------------------------------------

/** RTX 4090 — high-end GPU, normal CSV output. */
export const NVIDIA_RTX_4090_CSV =
  "NVIDIA GeForce RTX 4090, 24564, 550.54.14\n";

/** RTX 3060 — mid-range GPU. */
export const NVIDIA_RTX_3060_CSV =
  "NVIDIA GeForce RTX 3060, 12288, 535.183.01\n";

/** Tesla V100 — datacenter GPU with large VRAM. */
export const NVIDIA_TESLA_V100_CSV =
  "Tesla V100-SXM2-16GB, 16384, 525.85.12\n";

/** GTX 1050 Ti — older budget GPU. */
export const NVIDIA_GTX_1050TI_CSV =
  "NVIDIA GeForce GTX 1050 Ti, 4096, 470.182.03\n";

/** Multi-GPU: only first line should be parsed. */
export const NVIDIA_MULTI_GPU_CSV =
  "NVIDIA GeForce RTX 4090, 24564, 550.54.14\n" +
  "NVIDIA GeForce RTX 4090, 24564, 550.54.14\n";

/** Malformed: missing fields. */
export const NVIDIA_MALFORMED_MISSING_FIELDS = "NVIDIA GeForce RTX 4090\n";

/** Malformed: empty string. */
export const NVIDIA_MALFORMED_EMPTY = "";

/** Malformed: garbage output. */
export const NVIDIA_MALFORMED_GARBAGE =
  "ERROR: could not find GPU device\nPlease install NVIDIA drivers.\n";

/** Malformed: VRAM as non-numeric. */
export const NVIDIA_MALFORMED_VRAM_NAN =
  "NVIDIA GeForce RTX 4090, N/A, 550.54.14\n";

// ---------------------------------------------------------------------------
// system_profiler outputs (macOS)
// ---------------------------------------------------------------------------

/** Apple M2 Pro — standard macOS GPU output. */
export const MACOS_M2_PRO_PROFILER = `Graphics/Displays:

    Apple M2 Pro:

      Chipset Model: Apple M2 Pro
      Type: GPU
      Bus: Built-In
      Total Number of Cores: 19
      Vendor: Apple (0x106b)
      Metal Support: Metal 3
      VRAM (Dynamic, Max): 22 GB
`;

/** Apple M1 — minimal macOS GPU output (no VRAM line). */
export const MACOS_M1_NO_VRAM = `Graphics/Displays:

    Apple M1:

      Chipset Model: Apple M1
      Type: GPU
      Bus: Built-In
      Total Number of Cores: 8
      Vendor: Apple (0x106b)
      Metal Support: Metal 3
`;

/** Intel Iris — older Mac with discrete Intel GPU. */
export const MACOS_INTEL_IRIS = `Graphics/Displays:

    Intel Iris Plus Graphics 645:

      Chipset Model: Intel Iris Plus Graphics 645
      Type: GPU
      Bus: Built-In
      VRAM (Dynamic, Max): 1536 MB
      Vendor: Intel (0x8086)
`;

/** Malformed: no Chipset Model line. */
export const MACOS_MALFORMED_NO_CHIPSET = `Graphics/Displays:

    Unknown Graphics:
      Type: GPU
      Bus: Built-In
`;

/** Malformed: empty output. */
export const MACOS_MALFORMED_EMPTY = "";

// ---------------------------------------------------------------------------
// Runtime detection outputs
// ---------------------------------------------------------------------------

/** Ollama version output. */
export const OLLAMA_VERSION_OUTPUT = "ollama version is 0.4.1\n";

/** Ollama older version. */
export const OLLAMA_VERSION_OLD = "ollama version is 0.2.7\n";

/** llama-server version output. */
export const LLAMACPP_VERSION_OUTPUT =
  "version: b3200 (2e9eface)\nbuilt with cc (GCC) 12.2.0\n";

/** llama-server different format. */
export const LLAMACPP_VERSION_ALT =
  "llama-server v0.1.0 (b3500)\n";

/** Malformed runtime version — no version string. */
export const RUNTIME_VERSION_MALFORMED = "Usage: ollama [command]\n";

/** Empty runtime version. */
export const RUNTIME_VERSION_EMPTY = "";

// ---------------------------------------------------------------------------
// Missing command simulation
// ---------------------------------------------------------------------------

/**
 * Standard result for a command that is not installed.
 * The real CommandRunner would return { ok: false, exitCode: null }.
 */
export const MISSING_COMMAND_RESULT = Object.freeze({
  ok: false,
  stdout: "",
  stderr: "command not found",
  exitCode: null as number | null,
});

/**
 * Standard result for a command that fails with an error.
 */
export const FAILED_COMMAND_RESULT = Object.freeze({
  ok: false,
  stdout: "",
  stderr: "NVIDIA-SMI has failed because it couldn't communicate with the NVIDIA driver.",
  exitCode: 1,
});

/**
 * Standard successful result builder.
 */
export function successResult(stdout: string) {
  return { ok: true, stdout, stderr: "", exitCode: 0 };
}
