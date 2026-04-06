/**
 * Agent task dispatch — bounded task request handling.
 *
 * Phase 45: Orchestrates the full agent-run lifecycle:
 * 1. Validate input
 * 2. Select agent
 * 3. Assemble context
 * 4. Execute via adapter
 * 5. Capture result in session
 *
 * This is bounded execution, not autonomous orchestration.
 * No hidden retries. No background loops. No code modification.
 */

import type { AgentSummary } from "../agents/types.js";
import type { AgentPromptAssemblyInput, AgentPromptContext } from "../agent-context/types.js";
import { assembleAgentContext } from "../agent-context/assembly.js";
import type {
  AgentRunInput,
  AgentRunRequest,
  AgentRunResult,
  AgentRunError,
  AgentRunSummary,
  AgentRunId,
  AgentTaskKind,
} from "./types.js";
import { generateAgentRunId, buildAgentRunSummary, ALL_TASK_KINDS } from "./types.js";
import { selectAgent, getDefaultTaskDescription } from "./selection.js";
import type { AgentExecutionAdapter } from "./adapter.js";
import type { AgentSelectionCriteria } from "./selection.js";
import { isStreamingAdapter } from "./streaming.js";

/* ------------------------------------------------------------------ */
/*  Dispatch dependencies (injected)                                   */
/* ------------------------------------------------------------------ */

/**
 * Dependencies for the dispatch function.
 *
 * Injected so the dispatch is testable without real backends.
 */
export interface AgentRunDispatchDeps {
  /** Get agent summaries for the session. */
  readonly getSessionAgents: (sessionId: string) => readonly AgentSummary[];
  /** Get session-level data for context assembly. */
  readonly getContextInput?: (sessionId: string, agentKind: string, roleHint?: string) => AgentPromptAssemblyInput;
  /** The execution adapter to use. */
  readonly adapter: AgentExecutionAdapter;
}

/* ------------------------------------------------------------------ */
/*  Input validation                                                   */
/* ------------------------------------------------------------------ */

function validateInput(input: AgentRunInput): AgentRunError | null {
  if (!input.sessionId) {
    return { code: "SESSION_NOT_FOUND", message: "Session ID is required.", phase: "pending" };
  }
  if (!input.taskKind) {
    return { code: "INVALID_TASK", message: "Task kind is required.", phase: "pending" };
  }
  if (!ALL_TASK_KINDS.includes(input.taskKind)) {
    return { code: "INVALID_TASK", message: `Unknown task kind: "${input.taskKind}".`, phase: "pending" };
  }
  if ((input.taskKind === "custom" || input.taskKind === "general_query") && !input.taskDescription) {
    return { code: "INVALID_TASK", message: `Task description is required for "${input.taskKind}" tasks.`, phase: "pending" };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Default context input builder                                      */
/* ------------------------------------------------------------------ */

/**
 * Build a default context assembly input when no custom provider is available.
 *
 * This creates a minimal input with just the agent kind and role hint.
 * A real implementation would pull session/workspace data from the session manager.
 */
function defaultContextInput(
  _sessionId: string,
  agentKind: string,
  roleHint?: string,
): AgentPromptAssemblyInput {
  return {
    agentKind: agentKind as AgentPromptAssemblyInput["agentKind"],
    roleHint: roleHint as AgentPromptAssemblyInput["roleHint"],
  };
}

/* ------------------------------------------------------------------ */
/*  Main dispatch function                                             */
/* ------------------------------------------------------------------ */

/**
 * Dispatch a bounded agent task.
 *
 * This is the main entry point for agent execution.
 *
 * Lifecycle:
 * 1. Validate input
 * 2. Select agent (explicit ID or best-fit)
 * 3. Assemble agent context
 * 4. Execute via adapter (streaming if supported and requested)
 * 5. Return result
 *
 * Phase 49: Optional onChunk callback enables streaming output.
 * If the adapter supports streaming and onChunk is provided,
 * the streaming path is used. Otherwise falls back to full-response.
 *
 * Deterministic: same inputs + same adapter → same result structure.
 * No hidden retries or background loops.
 */
export async function dispatchAgentTask(
  input: AgentRunInput,
  deps: AgentRunDispatchDeps,
  onChunk?: (chunk: import("./streaming.js").StreamChunk) => void | Promise<void>,
): Promise<AgentRunResult> {
  const runId: AgentRunId = generateAgentRunId();
  const startedAt = new Date().toISOString();

  // Step 1: Validate input
  const validationError = validateInput(input);
  if (validationError) {
    return makeFailedResult(runId, input.sessionId, startedAt, validationError);
  }

  // Step 2: Select agent
  const agents = deps.getSessionAgents(input.sessionId);
  const criteria: AgentSelectionCriteria = {
    targetAgentId: input.targetAgentId,
    preferredAgentKind: input.preferredAgentKind,
    preferredRoleHint: input.preferredRoleHint,
    preferredStage: input.preferredStage,
  };

  const selection = selectAgent(agents, criteria);
  if (!selection.ok || !selection.agent || !selection.reason) {
    return makeFailedResult(runId, input.sessionId, startedAt, selection.error!);
  }

  // Step 3: Assemble context
  let context: AgentPromptContext;
  try {
    const getCtx = deps.getContextInput ?? defaultContextInput;
    const contextInput = getCtx(
      input.sessionId,
      selection.agent.kind,
      selection.agent.roleHint,
    );
    context = assembleAgentContext(contextInput);
  } catch (err) {
    return makeFailedResult(runId, input.sessionId, startedAt, {
      code: "CONTEXT_ASSEMBLY_FAILED",
      message: `Context assembly failed: ${err instanceof Error ? err.message : String(err)}`,
      phase: "context_assembling",
    });
  }

  // Build the resolved request
  const taskDescription = input.taskDescription ?? getDefaultTaskDescription(input.taskKind);
  const request: AgentRunRequest = {
    runId,
    sessionId: input.sessionId,
    agentId: selection.agent.id,
    agentName: selection.agent.name,
    agentKind: selection.agent.kind,
    taskKind: input.taskKind,
    taskDescription,
    selectionReason: selection.reason,
    contextSummary: context.summary,
    assembledContextText: context.assembledText,
    requestedAt: startedAt,
  };

  // Step 4: Execute via adapter (streaming if supported and callback provided)
  try {
    let output;
    if (onChunk && isStreamingAdapter(deps.adapter)) {
      output = await deps.adapter.executeStreaming(request, onChunk);
    } else {
      output = await deps.adapter.execute(request);
    }
    const finishedAt = new Date().toISOString();

    return {
      runId,
      sessionId: input.sessionId,
      status: "completed",
      request,
      output,
      error: null,
      startedAt,
      finishedAt,
      durationMs: output.durationMs,
    };
  } catch (err) {
    return makeFailedResult(runId, input.sessionId, startedAt, {
      code: "EXECUTION_FAILED",
      message: `Execution failed: ${err instanceof Error ? err.message : String(err)}`,
      phase: "executing",
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeFailedResult(
  runId: AgentRunId,
  sessionId: string,
  startedAt: string,
  error: AgentRunError,
): AgentRunResult {
  const finishedAt = new Date().toISOString();
  return {
    runId,
    sessionId,
    status: "failed",
    request: null,
    output: null,
    error,
    startedAt,
    finishedAt,
    durationMs: 0,
  };
}

/**
 * Build a human-readable inspection of an agent run result.
 *
 * Designed for the inspect_agent_run command output.
 */
export function inspectAgentRun(result: AgentRunResult): string {
  const lines: string[] = [];

  lines.push("Agent Run Report");
  lines.push("================");
  lines.push(`Run ID: ${result.runId}`);
  lines.push(`Session: ${result.sessionId}`);
  lines.push(`Status: ${result.status}`);
  lines.push(`Started: ${result.startedAt}`);
  lines.push(`Finished: ${result.finishedAt}`);
  lines.push(`Duration: ${result.durationMs}ms`);
  lines.push("");

  if (result.request) {
    lines.push("Request:");
    lines.push(`  Agent: ${result.request.agentName} (${result.request.agentKind})`);
    lines.push(`  Task: ${result.request.taskKind}`);
    lines.push(`  Description: ${result.request.taskDescription}`);
    lines.push(`  Selection: ${result.request.selectionReason.method} — ${result.request.selectionReason.explanation}`);
    if (result.request.contextSummary) {
      lines.push(`  Context: ${result.request.contextSummary.includedSliceCount} slices, ${result.request.contextSummary.totalChars} chars`);
    }
    lines.push("");
  }

  if (result.output) {
    lines.push("Output:");
    lines.push(`  Adapter: ${result.output.adapterKind}`);
    lines.push(`  Model-generated: ${result.output.isModelGenerated}`);
    lines.push(`  Duration: ${result.output.durationMs}ms`);
    lines.push(`  Response (first 500 chars):`);
    lines.push(`    ${result.output.responseText.substring(0, 500)}`);
    lines.push("");
  }

  if (result.error) {
    lines.push("Error:");
    lines.push(`  Code: ${result.error.code}`);
    lines.push(`  Message: ${result.error.message}`);
    lines.push(`  Phase: ${result.error.phase}`);
    if (result.error.detail) {
      lines.push(`  Detail: ${result.error.detail}`);
    }
    lines.push("");
  }

  lines.push("Notes:");
  lines.push("  - This is bounded agent execution, not autonomous orchestration.");
  lines.push("  - No hidden retries, background loops, or code modification.");

  return lines.join("\n");
}

/** Re-export buildAgentRunSummary for convenience. */
export { buildAgentRunSummary };
