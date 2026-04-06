/**
 * Execution adapter boundary for agent runs.
 *
 * Phase 45: A thin execution boundary so agent runs can be invoked
 * explicitly. This defines the adapter interface and provides a
 * stub/fake adapter for testing.
 *
 * This is honest:
 * - The stub adapter generates deterministic, non-model responses
 * - It is execution-ready: a real model-backed adapter can be plugged in
 * - No hidden retries, background loops, or autonomous behavior
 * - If actual model execution is not integrated, this is stated explicitly
 */

import type { AgentRunRequest, AgentRunOutput } from "./types.js";

/* ------------------------------------------------------------------ */
/*  Adapter interface                                                  */
/* ------------------------------------------------------------------ */

/**
 * Execution adapter for agent runs.
 *
 * Implementations provide the actual task execution logic.
 * The interface is minimal and synchronous (returns a Promise).
 *
 * Known adapter kinds:
 * - "stub" — deterministic fake responses for testing/demo
 * - "local" — future: local model execution
 * - "api" — future: remote API-backed model execution
 */
export interface AgentExecutionAdapter {
  /** Human-readable adapter kind identifier. */
  readonly kind: string;
  /** Whether this adapter produces real model-generated output. */
  readonly isModelBacked: boolean;
  /** Execute a bounded task. Returns the output or throws. */
  execute(request: AgentRunRequest): Promise<AgentRunOutput>;
}

/* ------------------------------------------------------------------ */
/*  Stub adapter (deterministic, for testing/demo)                     */
/* ------------------------------------------------------------------ */

/**
 * Stub execution adapter.
 *
 * Produces deterministic, context-aware responses without any model.
 * This is honest: responses are template-based, not model-generated.
 *
 * Useful for:
 * - Testing the full agent-run pipeline
 * - Demo mode in the app shell
 * - Verifying context assembly and dispatch
 */
export class StubExecutionAdapter implements AgentExecutionAdapter {
  readonly kind = "stub";
  readonly isModelBacked = false;

  /** Optional artificial delay in ms (for realistic testing). */
  private readonly delayMs: number;

  constructor(options?: { delayMs?: number }) {
    this.delayMs = options?.delayMs ?? 0;
  }

  async execute(request: AgentRunRequest): Promise<AgentRunOutput> {
    const start = Date.now();

    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    const responseText = this.generateStubResponse(request);
    const durationMs = Date.now() - start;

    return {
      responseText,
      isModelGenerated: false,
      adapterKind: "stub",
      durationMs,
    };
  }

  private generateStubResponse(request: AgentRunRequest): string {
    const agentLabel = `${request.agentName} (${request.agentKind})`;
    const contextNote = request.contextSummary
      ? `Context: ${request.contextSummary.includedSliceCount} slices, ${request.contextSummary.totalChars} chars from ${request.contextSummary.contributingSources.join(", ")}.`
      : "No context was assembled for this run.";

    switch (request.taskKind) {
      case "summarize_workspace":
        return [
          `[Stub response from ${agentLabel}]`,
          "",
          "## Workspace Summary",
          "",
          contextNote,
          "",
          "This is a stub/demo response. A real model-backed adapter would analyze the",
          "assembled workspace context and produce a meaningful summary of the project",
          "structure, languages, frameworks, and key files.",
          "",
          `Task: ${request.taskDescription}`,
          "",
          "Note: This response is deterministic and not model-generated.",
          "To get real agent output, configure a model-backed execution adapter.",
        ].join("\n");

      case "review_diagnostics":
        return [
          `[Stub response from ${agentLabel}]`,
          "",
          "## Diagnostics Review",
          "",
          contextNote,
          "",
          "This is a stub/demo response. A real model-backed adapter would review",
          "the diagnostics, errors, warnings, and toolchain state to provide",
          "actionable recommendations.",
          "",
          `Task: ${request.taskDescription}`,
          "",
          "Note: This response is deterministic and not model-generated.",
        ].join("\n");

      case "explain_files":
        return [
          `[Stub response from ${agentLabel}]`,
          "",
          "## File & Module Explanation",
          "",
          contextNote,
          "",
          "This is a stub/demo response. A real model-backed adapter would explain",
          "the role of key files, module structure, entrypoints, and test anchors.",
          "",
          `Task: ${request.taskDescription}`,
          "",
          "Note: This response is deterministic and not model-generated.",
        ].join("\n");

      case "summarize_github":
        return [
          `[Stub response from ${agentLabel}]`,
          "",
          "## GitHub MCP Summary",
          "",
          contextNote,
          "",
          "This is a stub/demo response. A real model-backed adapter would summarize",
          "GitHub MCP tool availability and any integration results.",
          "",
          `Task: ${request.taskDescription}`,
          "",
          "Note: This response is deterministic and not model-generated.",
        ].join("\n");

      case "general_query":
      case "custom":
      default:
        return [
          `[Stub response from ${agentLabel}]`,
          "",
          `## Response to: ${request.taskDescription}`,
          "",
          contextNote,
          "",
          "This is a stub/demo response. A real model-backed adapter would process",
          "the assembled context and task description to produce a meaningful answer.",
          "",
          "Note: This response is deterministic and not model-generated.",
          "To get real agent output, configure a model-backed execution adapter.",
        ].join("\n");
    }
  }
}
