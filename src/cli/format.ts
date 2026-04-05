/**
 * Shared output formatting for CLI commands.
 *
 * Provides consistent JSON and pretty-text output across
 * all CLI subcommands.
 */

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

/**
 * Print the given data to stdout.
 *
 * @param data  - Any serialisable value.
 * @param json  - If true, output as JSON; otherwise output as pretty text.
 * @param writer - Output function (defaults to `console.log`; injectable for tests).
 */
export function printOutput(
  data: unknown,
  json: boolean,
  writer: (msg: string) => void = console.log,
): void {
  if (json) {
    writer(JSON.stringify(data, null, 2));
  } else if (typeof data === "string") {
    writer(data);
  } else {
    writer(JSON.stringify(data, null, 2));
  }
}

/**
 * Print an error message to stderr.
 */
export function printError(
  message: string,
  writer: (msg: string) => void = console.error,
): void {
  writer(`Error: ${message}`);
}

// ---------------------------------------------------------------------------
// Pretty-text formatters
// ---------------------------------------------------------------------------

/**
 * Format a key-value record as aligned text lines.
 */
export function formatKeyValue(
  record: Record<string, unknown>,
  indent = 0,
): string {
  const prefix = " ".repeat(indent);
  const maxKey = Math.max(...Object.keys(record).map((k) => k.length));
  return Object.entries(record)
    .map(([k, v]) => `${prefix}${k.padEnd(maxKey)}  ${formatValue(v)}`)
    .join("\n");
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "(unknown)";
  if (typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    const det = v as { value: unknown; confidence: string };
    const val = det.value ?? "(unknown)";
    return `${val} [${det.confidence}]`;
  }
  if (Array.isArray(v)) {
    return v.length === 0 ? "(none)" : v.join(", ");
  }
  return String(v);
}
