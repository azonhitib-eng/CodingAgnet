/**
 * Environment-based adapter configuration loader.
 *
 * Phase 48: Minimal explicit configuration path for execution adapters.
 *
 * Loads adapter configuration from environment variables or a plain
 * configuration object. No magic auto-discovery. No broad provider
 * scanning. The caller gets an honest report of what is configured.
 *
 * Environment variables (all prefixed AGENT_ADAPTER_):
 *   AGENT_ADAPTER_KIND          — adapter kind ("stub" | "openai_compatible" | "echo_test")
 *   AGENT_ADAPTER_OPENAI_BASE_URL — OpenAI-compatible API base URL
 *   AGENT_ADAPTER_OPENAI_API_KEY  — API key / bearer token
 *   AGENT_ADAPTER_OPENAI_MODEL    — model name
 *   AGENT_ADAPTER_OPENAI_MAX_TOKENS — max tokens (optional)
 *   AGENT_ADAPTER_OPENAI_TEMPERATURE — temperature (optional)
 *   AGENT_ADAPTER_OPENAI_TIMEOUT_MS — timeout in ms (optional)
 *   AGENT_ADAPTER_OPENAI_LABEL     — display label (optional)
 *
 * Configuration is honest:
 * - not_configured: no env vars set
 * - partially_configured: some vars set but incomplete
 * - configured: all required vars set
 */

import type { AdapterKind, OpenAIAdapterConfig } from "./adapter-config.js";
import { ALL_ADAPTER_KINDS } from "./adapter-config.js";
import type { ResolveAdapterOptions } from "./adapter-manager.js";

/* ------------------------------------------------------------------ */
/*  Environment variable names                                         */
/* ------------------------------------------------------------------ */

/** Prefix for all adapter environment variables. */
export const ENV_PREFIX = "AGENT_ADAPTER_" as const;

/** Known environment variable names. */
export const ENV_VARS = {
  KIND: `${ENV_PREFIX}KIND`,
  OPENAI_BASE_URL: `${ENV_PREFIX}OPENAI_BASE_URL`,
  OPENAI_API_KEY: `${ENV_PREFIX}OPENAI_API_KEY`,
  OPENAI_MODEL: `${ENV_PREFIX}OPENAI_MODEL`,
  OPENAI_MAX_TOKENS: `${ENV_PREFIX}OPENAI_MAX_TOKENS`,
  OPENAI_TEMPERATURE: `${ENV_PREFIX}OPENAI_TEMPERATURE`,
  OPENAI_TIMEOUT_MS: `${ENV_PREFIX}OPENAI_TIMEOUT_MS`,
  OPENAI_LABEL: `${ENV_PREFIX}OPENAI_LABEL`,
} as const;

/** All known env var keys. */
export const ALL_ENV_VARS: readonly string[] = Object.values(ENV_VARS);

/* ------------------------------------------------------------------ */
/*  Configuration load result                                          */
/* ------------------------------------------------------------------ */

/** Status of a configuration load attempt. */
export type EnvConfigStatus =
  | "not_configured"         // No env vars set
  | "partially_configured"   // Some vars set but incomplete
  | "configured";            // All required vars present

/** Result of loading adapter configuration from environment. */
export interface EnvConfigResult {
  /** Load status. */
  readonly status: EnvConfigStatus;
  /** Resolved adapter kind (null if not configured). */
  readonly kind: AdapterKind | null;
  /** OpenAI config (null if not openai_compatible or not configured). */
  readonly openaiConfig: OpenAIAdapterConfig | null;
  /** Resolve adapter options ready for resolveAdapter() (null if not configured). */
  readonly resolveOptions: ResolveAdapterOptions | null;
  /** Human-readable report of what was found. */
  readonly report: string;
  /** Warnings about partial/invalid configuration. */
  readonly warnings: readonly string[];
  /** Which env vars were detected. */
  readonly detectedVars: readonly string[];
}

/* ------------------------------------------------------------------ */
/*  Loader                                                             */
/* ------------------------------------------------------------------ */

/**
 * Load adapter configuration from environment variables.
 *
 * Reads process.env by default. Accepts an override env map for testing.
 *
 * Returns an honest result:
 * - not_configured: no relevant env vars found
 * - partially_configured: some vars found but not enough to resolve
 * - configured: all required vars present, ready to resolve
 */
export function loadAdapterConfigFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): EnvConfigResult {
  const detectedVars: string[] = [];
  const warnings: string[] = [];

  // Check which vars are set
  for (const key of ALL_ENV_VARS) {
    if (env[key] !== undefined && env[key] !== "") {
      detectedVars.push(key);
    }
  }

  // No env vars set at all
  if (detectedVars.length === 0) {
    return {
      status: "not_configured",
      kind: null,
      openaiConfig: null,
      resolveOptions: null,
      report: "No adapter environment variables detected. Using default stub adapter.",
      warnings: [],
      detectedVars: [],
    };
  }

  // Determine kind
  const rawKind = env[ENV_VARS.KIND]?.trim();
  let kind: AdapterKind;

  if (!rawKind) {
    // Vars detected but no kind specified
    warnings.push(
      `Environment variables detected (${detectedVars.join(", ")}) but ${ENV_VARS.KIND} is not set.`,
    );
    return {
      status: "partially_configured",
      kind: null,
      openaiConfig: null,
      resolveOptions: null,
      report: `Partial configuration: ${detectedVars.length} env var(s) detected but adapter kind is missing.`,
      warnings,
      detectedVars,
    };
  }

  if (!ALL_ADAPTER_KINDS.includes(rawKind as AdapterKind)) {
    warnings.push(
      `Unknown adapter kind: "${rawKind}". Known kinds: ${ALL_ADAPTER_KINDS.join(", ")}.`,
    );
    return {
      status: "partially_configured",
      kind: null,
      openaiConfig: null,
      resolveOptions: null,
      report: `Invalid configuration: unknown adapter kind "${rawKind}".`,
      warnings,
      detectedVars,
    };
  }

  kind = rawKind as AdapterKind;

  // Stub or echo_test — no additional config needed
  if (kind === "stub" || kind === "echo_test") {
    return {
      status: "configured",
      kind,
      openaiConfig: null,
      resolveOptions: { kind },
      report: `Adapter configured: ${kind} (no additional configuration needed).`,
      warnings,
      detectedVars,
    };
  }

  // OpenAI-compatible — need base URL, API key, model
  if (kind === "openai_compatible") {
    return loadOpenAIConfigFromEnv(env, detectedVars, warnings);
  }

  // Unreachable for known kinds but defensive
  return {
    status: "partially_configured",
    kind,
    openaiConfig: null,
    resolveOptions: null,
    report: `Adapter kind "${kind}" recognized but no loader implemented.`,
    warnings,
    detectedVars,
  };
}

/* ------------------------------------------------------------------ */
/*  OpenAI config loader                                               */
/* ------------------------------------------------------------------ */

function loadOpenAIConfigFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  detectedVars: string[],
  warnings: string[],
): EnvConfigResult {
  const baseUrl = env[ENV_VARS.OPENAI_BASE_URL]?.trim();
  const apiKey = env[ENV_VARS.OPENAI_API_KEY]; // Allow empty string for no-auth
  const model = env[ENV_VARS.OPENAI_MODEL]?.trim();

  const missing: string[] = [];
  if (!baseUrl) missing.push(ENV_VARS.OPENAI_BASE_URL);
  if (apiKey === undefined) missing.push(ENV_VARS.OPENAI_API_KEY);
  if (!model) missing.push(ENV_VARS.OPENAI_MODEL);

  if (missing.length > 0) {
    warnings.push(`Missing required OpenAI env var(s): ${missing.join(", ")}.`);
    return {
      status: "partially_configured",
      kind: "openai_compatible",
      openaiConfig: null,
      resolveOptions: null,
      report: `Partial OpenAI configuration: missing ${missing.join(", ")}.`,
      warnings,
      detectedVars,
    };
  }

  // Parse optional numeric fields
  const maxTokens = parseOptionalInt(env[ENV_VARS.OPENAI_MAX_TOKENS], ENV_VARS.OPENAI_MAX_TOKENS, warnings);
  const temperature = parseOptionalFloat(env[ENV_VARS.OPENAI_TEMPERATURE], ENV_VARS.OPENAI_TEMPERATURE, warnings);
  const timeoutMs = parseOptionalInt(env[ENV_VARS.OPENAI_TIMEOUT_MS], ENV_VARS.OPENAI_TIMEOUT_MS, warnings);
  const label = env[ENV_VARS.OPENAI_LABEL]?.trim() || undefined;

  const openaiConfig: OpenAIAdapterConfig = {
    baseUrl: baseUrl!,
    apiKey: apiKey!,
    model: model!,
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(label !== undefined ? { label } : {}),
  };

  return {
    status: "configured",
    kind: "openai_compatible",
    openaiConfig,
    resolveOptions: { kind: "openai_compatible", openaiConfig },
    report: `OpenAI-compatible adapter configured: model=${model}, endpoint=${baseUrl}.`,
    warnings,
    detectedVars,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseOptionalInt(
  raw: string | undefined,
  varName: string,
  warnings: string[],
): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) {
    warnings.push(`${varName} value "${raw}" is not a valid positive integer; ignored.`);
    return undefined;
  }
  return n;
}

function parseOptionalFloat(
  raw: string | undefined,
  varName: string,
  warnings: string[],
): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const n = parseFloat(raw);
  if (isNaN(n) || n < 0 || n > 2) {
    warnings.push(`${varName} value "${raw}" is not valid (0–2 range); ignored.`);
    return undefined;
  }
  return n;
}

/**
 * Build a diagnostic report of the current adapter environment state.
 *
 * Useful for debugging and for the shell to show configuration status.
 */
export function buildEnvConfigReport(
  result: EnvConfigResult,
): string {
  const lines: string[] = [];
  lines.push("Adapter Environment Configuration");
  lines.push("=================================");
  lines.push(`Status: ${result.status}`);
  lines.push(`Kind: ${result.kind ?? "(none)"}`);
  if (result.detectedVars.length > 0) {
    lines.push(`Detected vars: ${result.detectedVars.join(", ")}`);
  } else {
    lines.push("Detected vars: (none)");
  }
  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const w of result.warnings) {
      lines.push(`  - ${w}`);
    }
  }
  lines.push("");
  lines.push(result.report);
  return lines.join("\n");
}
