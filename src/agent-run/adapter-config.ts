/**
 * Execution adapter configuration and availability.
 *
 * Phase 46: Model-backed execution adapter boundary.
 *
 * This module defines the configuration model for execution adapters,
 * including explicit availability states, structured errors for missing
 * configuration, and adapter lifecycle inspection.
 *
 * Configuration is explicit and honest:
 * - configured_available: adapter is ready to execute
 * - configured_unavailable: adapter is configured but backend is unreachable
 * - not_configured: no configuration provided (e.g. missing API key)
 * - unsupported: adapter kind is not recognized or not implemented
 *
 * No fake availability. No hidden fallbacks.
 */

import type { AgentExecutionAdapter } from "./adapter.js";

/* ------------------------------------------------------------------ */
/*  Adapter availability states                                        */
/* ------------------------------------------------------------------ */

/**
 * Availability state of an execution adapter.
 *
 * Transitions:
 *   not_configured → configured_available (after providing config)
 *   not_configured → configured_unavailable (config present but backend down)
 *   configured_available → configured_unavailable (backend goes down)
 *   configured_unavailable → configured_available (backend recovers)
 *   unsupported (terminal — adapter kind not recognized)
 */
export type AdapterAvailability =
  | "configured_available"
  | "configured_unavailable"
  | "not_configured"
  | "unsupported";

/** Human-readable labels for adapter availability states. */
export const ADAPTER_AVAILABILITY_LABELS: Readonly<Record<AdapterAvailability, string>> = {
  configured_available: "Configured & Available",
  configured_unavailable: "Configured but Unavailable",
  not_configured: "Not Configured",
  unsupported: "Unsupported",
} as const;

/* ------------------------------------------------------------------ */
/*  Adapter kind                                                       */
/* ------------------------------------------------------------------ */

/** Known adapter kinds. */
export type AdapterKind = "stub" | "openai_compatible" | "echo_test";

/** All known adapter kinds. */
export const ALL_ADAPTER_KINDS: readonly AdapterKind[] = [
  "stub",
  "openai_compatible",
  "echo_test",
] as const;

/** Human-readable labels for adapter kinds. */
export const ADAPTER_KIND_LABELS: Readonly<Record<AdapterKind, string>> = {
  stub: "Stub (Deterministic / Demo)",
  openai_compatible: "OpenAI-Compatible API",
  echo_test: "Echo Test (Deterministic)",
} as const;

/* ------------------------------------------------------------------ */
/*  Adapter configuration                                              */
/* ------------------------------------------------------------------ */

/**
 * Configuration for an OpenAI-compatible API adapter.
 *
 * Supports any provider that exposes a chat-completions-compatible endpoint:
 * - OpenAI, Azure OpenAI, Ollama, LM Studio, vLLM, etc.
 *
 * Configuration is explicit — no auto-detection or magic environment scanning.
 */
export interface OpenAIAdapterConfig {
  /** Base URL of the API endpoint (e.g. "https://api.openai.com/v1"). */
  readonly baseUrl: string;
  /** API key / bearer token. Empty string means no auth required (e.g. local Ollama). */
  readonly apiKey: string;
  /** Model name to use (e.g. "gpt-4o-mini", "llama3.2"). */
  readonly model: string;
  /** Maximum tokens to generate. Default: 1024. */
  readonly maxTokens?: number;
  /** Temperature for generation. Default: 0.2 (low for determinism). */
  readonly temperature?: number;
  /** Request timeout in milliseconds. Default: 30000. */
  readonly timeoutMs?: number;
  /** Optional display label for the adapter. */
  readonly label?: string;
}

/** Validate an OpenAI adapter config. Returns error messages or empty array. */
export function validateOpenAIConfig(config: Partial<OpenAIAdapterConfig>): string[] {
  const errors: string[] = [];
  if (!config.baseUrl || typeof config.baseUrl !== "string" || config.baseUrl.trim() === "") {
    errors.push("baseUrl is required and must be a non-empty string.");
  }
  if (config.apiKey === undefined || config.apiKey === null || typeof config.apiKey !== "string") {
    errors.push("apiKey is required (use empty string for no-auth endpoints).");
  }
  if (!config.model || typeof config.model !== "string" || config.model.trim() === "") {
    errors.push("model is required and must be a non-empty string.");
  }
  if (config.maxTokens !== undefined && (typeof config.maxTokens !== "number" || config.maxTokens <= 0)) {
    errors.push("maxTokens must be a positive number.");
  }
  if (config.temperature !== undefined && (typeof config.temperature !== "number" || config.temperature < 0 || config.temperature > 2)) {
    errors.push("temperature must be between 0 and 2.");
  }
  if (config.timeoutMs !== undefined && (typeof config.timeoutMs !== "number" || config.timeoutMs <= 0)) {
    errors.push("timeoutMs must be a positive number.");
  }
  return errors;
}

/* ------------------------------------------------------------------ */
/*  Adapter status                                                     */
/* ------------------------------------------------------------------ */

/**
 * Full status snapshot of an execution adapter.
 *
 * This is what the shell/console can display.
 */
export interface AdapterStatus {
  /** Adapter kind identifier. */
  readonly kind: AdapterKind | string;
  /** Human-readable label. */
  readonly label: string;
  /** Whether this adapter produces real model output. */
  readonly isModelBacked: boolean;
  /** Current availability state. */
  readonly availability: AdapterAvailability;
  /** Human-readable availability message. */
  readonly availabilityMessage: string;
  /** Backend model name, if configured (e.g. "gpt-4o-mini"). */
  readonly modelName: string | null;
  /** Backend base URL, if configured (redacted for display). */
  readonly baseUrl: string | null;
  /** ISO-8601 timestamp of last availability check. */
  readonly lastCheckedAt: string | null;
  /** Last error message, if unavailable. */
  readonly lastError: string | null;
}

/**
 * Build adapter status from the current adapter.
 *
 * Uses the adapter's own metadata + the last availability check results.
 */
export function buildAdapterStatus(
  adapter: AgentExecutionAdapter,
  availability: AdapterAvailability,
  extra?: {
    modelName?: string;
    baseUrl?: string;
    lastCheckedAt?: string;
    lastError?: string;
    label?: string;
  },
): AdapterStatus {
  return {
    kind: adapter.kind,
    label: extra?.label ?? ADAPTER_KIND_LABELS[adapter.kind as AdapterKind] ?? adapter.kind,
    isModelBacked: adapter.isModelBacked,
    availability,
    availabilityMessage: ADAPTER_AVAILABILITY_LABELS[availability] ?? availability,
    modelName: extra?.modelName ?? null,
    baseUrl: extra?.baseUrl ? redactUrl(extra.baseUrl) : null,
    lastCheckedAt: extra?.lastCheckedAt ?? null,
    lastError: extra?.lastError ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  Adapter resolution                                                 */
/* ------------------------------------------------------------------ */

/**
 * Structured error when adapter configuration is missing or invalid.
 */
export interface AdapterConfigError {
  /** Error kind for programmatic handling. */
  readonly kind: "not_configured" | "invalid_config" | "unsupported_kind" | "unavailable";
  /** Human-readable message. */
  readonly message: string;
  /** Detailed errors (e.g. validation messages). */
  readonly details: readonly string[];
}

/**
 * Result of resolving an adapter from configuration.
 */
export interface AdapterResolutionResult {
  /** Whether resolution succeeded. */
  readonly ok: boolean;
  /** Resolved adapter (null if failed). */
  readonly adapter: AgentExecutionAdapter | null;
  /** Adapter status snapshot. */
  readonly status: AdapterStatus | null;
  /** Error (null if successful). */
  readonly error: AdapterConfigError | null;
}

/* ------------------------------------------------------------------ */
/*  Inspection helper                                                  */
/* ------------------------------------------------------------------ */

/**
 * Build a human-readable inspection report for an adapter status.
 */
export function inspectAdapterStatus(status: AdapterStatus): string {
  const lines: string[] = [];
  lines.push("Execution Adapter Status");
  lines.push("========================");
  lines.push(`Kind: ${status.kind}`);
  lines.push(`Label: ${status.label}`);
  lines.push(`Model-Backed: ${status.isModelBacked}`);
  lines.push(`Availability: ${status.availability} — ${status.availabilityMessage}`);
  if (status.modelName) {
    lines.push(`Model: ${status.modelName}`);
  }
  if (status.baseUrl) {
    lines.push(`Endpoint: ${status.baseUrl}`);
  }
  if (status.lastCheckedAt) {
    lines.push(`Last Checked: ${status.lastCheckedAt}`);
  }
  if (status.lastError) {
    lines.push(`Last Error: ${status.lastError}`);
  }
  lines.push("");
  lines.push("Notes:");
  if (status.isModelBacked) {
    lines.push("  - This adapter produces real model-generated output.");
  } else {
    lines.push("  - This adapter produces deterministic/template responses (not model-generated).");
  }
  lines.push("  - No hidden retries, background loops, or code modification.");
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Redact URL for display: keep scheme + host, hide path/query. */
function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/***`;
  } catch {
    return "***";
  }
}
