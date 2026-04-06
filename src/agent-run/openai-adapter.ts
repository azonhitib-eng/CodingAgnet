/**
 * OpenAI-compatible execution adapter.
 *
 * Phase 46: Model-backed execution adapter boundary.
 *
 * This adapter works with any provider that exposes a chat-completions-compatible
 * REST endpoint: OpenAI, Azure OpenAI, Ollama, LM Studio, vLLM, etc.
 *
 * It is honest:
 * - Output is clearly marked as model-generated
 * - Backend model name and endpoint are reported
 * - Errors are structured and explicit
 * - No hidden retries, background loops, or code modification
 * - If the backend is unavailable, it fails fast with a clear message
 *
 * This does NOT depend on any external npm packages.
 * It uses native fetch() for HTTP requests.
 */

import type { AgentRunRequest, AgentRunOutput } from "./types.js";
import type { AgentExecutionAdapter } from "./adapter.js";
import type { OpenAIAdapterConfig } from "./adapter-config.js";

/* ------------------------------------------------------------------ */
/*  Chat completions request/response shapes                           */
/* ------------------------------------------------------------------ */

/** Minimal chat message shape for the OpenAI chat completions API. */
interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

/** Minimal request body for the chat completions API. */
interface ChatCompletionsRequest {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly max_tokens: number;
  readonly temperature: number;
}

/** Minimal response body from the chat completions API. */
interface ChatCompletionsResponse {
  readonly id?: string;
  readonly model?: string;
  readonly choices?: readonly {
    readonly message?: {
      readonly role?: string;
      readonly content?: string;
    };
    readonly finish_reason?: string;
  }[];
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  };
  readonly error?: {
    readonly message?: string;
    readonly type?: string;
    readonly code?: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Prompt builder                                                     */
/* ------------------------------------------------------------------ */

/**
 * Build chat messages from an agent run request.
 *
 * The system message sets a bounded, read-only scope.
 * The user message includes assembled context + task description.
 */
function buildMessages(request: AgentRunRequest): ChatMessage[] {
  const systemPrompt = [
    "You are a helpful assistant analyzing a software project.",
    "You are performing a bounded, read-only task. Do not suggest code modifications.",
    "Be concise, factual, and structured. Use markdown formatting.",
    `Your task type: ${request.taskKind}.`,
  ].join(" ");

  const userContent = [
    `## Task: ${request.taskDescription}`,
    "",
    request.assembledContextText
      ? `## Context\n\n${request.assembledContextText}`
      : "(No workspace context was assembled for this run.)",
  ].join("\n");

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
}

/* ------------------------------------------------------------------ */
/*  Fetch helper (injectable for testing)                               */
/* ------------------------------------------------------------------ */

/**
 * Fetch function type — matches the global fetch signature.
 *
 * Injected for testing so we don't depend on real HTTP in tests.
 */
export type FetchFn = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; statusText: string; json: () => Promise<unknown> }>;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Strip trailing slashes from a URL string (avoids regex ReDoS). */
function stripTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") {
    end--;
  }
  return url.substring(0, end);
}

/* ------------------------------------------------------------------ */
/*  OpenAI-compatible adapter                                          */
/* ------------------------------------------------------------------ */

/**
 * OpenAI-compatible execution adapter.
 *
 * Uses native fetch() to call any chat-completions-compatible API.
 * Supports: OpenAI, Azure OpenAI, Ollama, LM Studio, vLLM, etc.
 *
 * This is honest:
 * - isModelBacked = true
 * - adapterKind = "openai_compatible"
 * - The response includes the backend model name
 * - Errors are structured and explicit
 */
export class OpenAIExecutionAdapter implements AgentExecutionAdapter {
  readonly kind = "openai_compatible";
  readonly isModelBacked = true;

  private readonly config: Readonly<OpenAIAdapterConfig>;
  private readonly fetchFn: FetchFn;

  constructor(config: OpenAIAdapterConfig, fetchFn?: FetchFn) {
    this.config = config;
    this.fetchFn = fetchFn ?? (globalThis.fetch as unknown as FetchFn);
  }

  /** The configured model name. */
  get modelName(): string {
    return this.config.model;
  }

  /** The configured base URL. */
  get baseUrl(): string {
    return this.config.baseUrl;
  }

  /** The display label. */
  get label(): string {
    return this.config.label ?? `OpenAI-compatible (${this.config.model})`;
  }

  async execute(request: AgentRunRequest): Promise<AgentRunOutput> {
    const start = Date.now();
    const messages = buildMessages(request);
    const maxTokens = this.config.maxTokens ?? 1024;
    const temperature = this.config.temperature ?? 0.2;
    const timeoutMs = this.config.timeoutMs ?? 30_000;

    const requestBody: ChatCompletionsRequest = {
      model: this.config.model,
      messages,
      max_tokens: maxTokens,
      temperature,
    };

    const url = `${stripTrailingSlashes(this.config.baseUrl)}/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    // Timeout via AbortController
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Awaited<ReturnType<FetchFn>>;
    try {
      response = await this.fetchFn(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("abort") || msg.includes("Abort")) {
        throw new Error(`Request timed out after ${timeoutMs}ms to ${this.config.baseUrl}`);
      }
      throw new Error(`Network error calling ${this.config.baseUrl}: ${msg}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      let errorMsg = `API returned HTTP ${response.status} ${response.statusText}`;
      try {
        const body = (await response.json()) as ChatCompletionsResponse;
        if (body.error?.message) {
          errorMsg += `: ${body.error.message}`;
        }
      } catch {
        // Ignore JSON parse errors on error responses
      }
      throw new Error(errorMsg);
    }

    const body = (await response.json()) as ChatCompletionsResponse;

    if (body.error?.message) {
      throw new Error(`API error: ${body.error.message}`);
    }

    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("API returned empty response — no content in first choice.");
    }

    const durationMs = Date.now() - start;

    return {
      responseText: content,
      isModelGenerated: true,
      adapterKind: "openai_compatible",
      structuredData: {
        model: body.model ?? this.config.model,
        finishReason: body.choices?.[0]?.finish_reason ?? null,
        promptTokens: body.usage?.prompt_tokens ?? null,
        completionTokens: body.usage?.completion_tokens ?? null,
        totalTokens: body.usage?.total_tokens ?? null,
        backendUrl: this.config.baseUrl,
      },
      durationMs,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Availability check                                                 */
/* ------------------------------------------------------------------ */

/**
 * Check if the OpenAI-compatible API backend is reachable.
 *
 * Sends a minimal request to the models endpoint or a tiny completions request.
 * Returns true if reachable, false otherwise.
 *
 * This is a simple, non-destructive check — no state changes.
 */
export async function checkOpenAIAvailability(
  config: OpenAIAdapterConfig,
  fetchFn?: FetchFn,
): Promise<{ available: boolean; error?: string }> {
  const fetch = fetchFn ?? (globalThis.fetch as unknown as FetchFn);
  const baseUrl = stripTrailingSlashes(config.baseUrl);
  const url = `${baseUrl}/models`;
  const headers: Record<string, string> = {};
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const timeoutMs = config.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      body: "",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (response.ok) {
      return { available: true };
    }
    // 401/403 means the endpoint is reachable but auth is wrong — still "reachable"
    if (response.status === 401 || response.status === 403) {
      return { available: false, error: `Authentication failed (HTTP ${response.status}).` };
    }
    return { available: false, error: `Backend returned HTTP ${response.status}.` };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return { available: false, error: `Cannot reach backend: ${msg}` };
  }
}
