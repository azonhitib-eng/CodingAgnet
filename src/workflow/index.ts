/**
 * Workflow orchestration layer — module barrel export.
 *
 * Re-exports all workflow types and the runner.
 */

export type {
  WorkflowStageName,
  WorkflowInput,
  WorkflowResult,
  WorkflowStatus,
  StageResult,
  CompletedStage,
  StageOutputMap,
  CatalogLoadingOutput,
  HostAcquisitionOutput,
  RecommendationOutput,
  TargetSelectionOutput,
  CompatibilityEvaluationOutput,
  InstallPlanningOutput,
  SafetyEvaluationOutput,
  RenderingOutput,
} from "./types.js";

export { STAGE_ORDER } from "./types.js";
export { runWorkflow } from "./workflow-runner.js";
