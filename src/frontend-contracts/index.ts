/**
 * Frontend contract layer — public exports.
 *
 * Re-exports view-model types, status labels, mappers, and error contracts
 * for frontend consumption.
 */

// View-model types
export type {
  HostSummaryViewModel,
  ArtifactListItem,
  RecommendationItem,
  CompatibilityViewModel,
  PlanStepView,
  PlanReviewViewModel,
  SafetyViolationView,
  SafetyStatusView,
  WorkflowStageView,
  WorkflowViewModel,
  FinalReviewState,
  CompatibilityStatus,
  WorkflowViewStatus,
  SafetyStatus,
  Severity,
} from "./types.js";

// Status label constants
export {
  COMPATIBILITY_LABELS,
  WORKFLOW_STATUS_LABELS,
  SAFETY_STATUS_LABELS,
  RISK_SEVERITY,
  STAGE_LABELS,
} from "./status-labels.js";

export type { StatusLabel } from "./status-labels.js";

// Mapping / transformation functions
export {
  toHostSummary,
  toArtifactListItem,
  toCompatibilityView,
  toRecommendationItem,
  toRecommendationList,
  toSafetyStatusView,
  toPlanReviewView,
  toWorkflowView,
  toFinalReviewState,
} from "./mappers.js";

export type { FinalReviewInput } from "./mappers.js";

// Error contract
export type { FrontendErrorCode, FrontendError } from "./errors.js";
export { createFrontendError, normalizeFrontendError } from "./errors.js";
