/**
 * detect-host CLI command.
 *
 * Detects the local host profile and outputs it in pretty or JSON format.
 * Wraps `detectHost` from the detection layer.
 */

import { detectHost } from "../../detection/host-detector.js";
import type { CatalogBundle } from "../../catalog/bundle.js";
import type { HostProfile } from "../../types/host.js";
import { formatKeyValue, printOutput } from "../format.js";

// ---------------------------------------------------------------------------
// Pretty formatter
// ---------------------------------------------------------------------------

function formatHostPretty(host: HostProfile): string {
  const lines: string[] = [];

  lines.push("=== Host Profile ===");
  lines.push(`Detected at: ${host.detectedAt}`);
  lines.push("");

  lines.push("--- OS ---");
  lines.push(formatKeyValue({
    Platform: host.os.platform,
    Release: host.os.release,
    Arch: host.os.arch,
  }));
  lines.push("");

  lines.push("--- CPU ---");
  lines.push(formatKeyValue({
    Model: host.cpu.model,
    Cores: host.cpu.cores,
    Threads: host.cpu.threads,
  }));
  lines.push("");

  lines.push("--- Memory ---");
  lines.push(formatKeyValue({
    "Total (GB)": host.memory.totalGb,
    "Available (GB)": host.memory.availableGb,
  }));
  lines.push("");

  lines.push("--- GPU ---");
  if (host.gpu) {
    lines.push(formatKeyValue({
      Present: host.gpu.present,
      Model: host.gpu.model,
      "VRAM (GB)": host.gpu.vramGb,
      "CUDA Version": host.gpu.cudaVersion,
      "ROCm Version": host.gpu.rocmVersion,
      "Driver Version": host.gpu.driverVersion,
    }));
  } else {
    lines.push("  (no GPU detected)");
  }
  lines.push("");

  lines.push("--- Installed Runtimes ---");
  if (host.installedRuntimes.length === 0) {
    lines.push("  (none)");
  } else {
    for (const rt of host.installedRuntimes) {
      lines.push(`  ${rt.runtimeId}: ${rt.version.value ?? "(unknown)"} [${rt.version.confidence}]`);
    }
  }

  if (host.missingDependencies.length > 0) {
    lines.push("");
    lines.push("--- Missing Dependencies ---");
    for (const dep of host.missingDependencies) {
      lines.push(`  - ${dep}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export interface DetectHostArgs {
  json: boolean;
  catalogDir?: string;
  bundle?: CatalogBundle;
  writer?: (msg: string) => void;
}

/**
 * Execute the detect-host command.
 *
 * Runs live host detection (or uses an injected bundle for runtime
 * detection) and outputs the host profile.
 */
export async function runDetectHost(args: DetectHostArgs): Promise<HostProfile> {
  const runtimes = args.bundle ? args.bundle.runtimes.listAll() : [];
  const host = await detectHost({ catalogRuntimes: runtimes });

  if (args.json) {
    printOutput(host, true, args.writer);
  } else {
    printOutput(formatHostPretty(host), false, args.writer);
  }

  return host;
}
