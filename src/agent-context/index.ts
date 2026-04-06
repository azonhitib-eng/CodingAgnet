/**
 * Agent context module — barrel exports.
 *
 * Phase 44: Context-informed agent prompting.
 */

/* types */
export type {
  AgentPromptPriority,
  AgentPromptReasonKind,
  AgentPromptReason,
  AgentPromptEvidence,
  AgentPromptSliceSource,
  AgentPromptContextSlice,
  AgentPromptBudget,
  AgentPromptAssemblyInput,
  AgentPromptAssemblyResult,
  AgentPromptSummary,
  AgentPromptContext,
} from "./types.js";

export { DEFAULT_AGENT_PROMPT_BUDGET } from "./types.js";

/* slice builders */
export {
  buildSessionSlice,
  buildWorkspaceSlice,
  buildFingerprintSlice,
  buildToolchainSlice,
  buildDiagnosticsSlice,
  buildLanguageContextSlice,
  buildMcpSlice,
  buildAgentsSlice,
  buildGitHubMcpSlice,
  buildAllCandidateSlices,
} from "./slice-builders.js";

/* prioritization */
export {
  priorityScore,
  comparePriority,
  meetsPriorityThreshold,
  trimSlice,
  applyBudget,
  adjustPrioritiesForRole,
} from "./prioritization.js";

/* assembly */
export {
  resolveBudget,
  buildPromptSummary,
  assembleAgentContext,
  inspectAssembly,
} from "./assembly.js";

/* traceability */
export {
  getSliceReasons,
  getSliceEvidence,
  findSlice,
  getSlicesBySource,
  getContributingSources,
  getAllInclusionReasons,
  getAllExclusionReasons,
  buildCompactExplanation,
  buildOneLinerSummary,
} from "./traceability.js";

/* session integration */
export {
  AGENT_CONTEXT_EVENT_KINDS,
  agentContextAssembled,
  agentContextRefreshed,
  agentContextFailed,
  isAgentContextEvent,
  filterAgentContextEvents,
  buildAgentContextSessionSummary,
} from "./session-integration.js";

export type {
  AgentContextEventKind,
  AgentContextSessionSummary,
} from "./session-integration.js";
