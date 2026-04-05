/**
 * Detection layer barrel export.
 */

// Command runner
export { runCommand, type CommandRunner, type CommandResult, type RunCommandOptions } from "./run-command.js";

// Individual detectors
export { detectOs, parseOsInfo } from "./os-detector.js";
export { detectCpu, parseCpuInfo, estimateCores } from "./cpu-detector.js";
export { detectMemory, parseMemoryInfo, bytesToGb } from "./memory-detector.js";
export {
  detectGpu,
  parseNvidiaSmiCsv,
  parseSystemProfiler,
  unknownGpu,
} from "./gpu-detector.js";
export {
  detectRuntimes,
  detectSingleRuntime,
  extractVersion,
} from "./runtime-detector.js";

// Orchestrator
export { detectHost, type DetectHostOptions } from "./host-detector.js";
