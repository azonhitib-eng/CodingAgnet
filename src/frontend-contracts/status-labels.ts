/**
 * Presentation-friendly labels, severity levels, and summary messages
 * for every normalized status in the frontend contract layer.
 */

import type {
  CompatibilityStatus,
  WorkflowViewStatus,
  SafetyStatus,
  Severity,
} from "./types.js";

import type { RiskLevel } from "../types/install-plan.js";
import type { WorkflowStageName } from "../workflow/types.js";

// ─── Compatibility labels ───────────────────────────────────────────────

export interface StatusLabel {
  label: string;
  severity: Severity;
  summary: string;
}

export const COMPATIBILITY_LABELS: Record<CompatibilityStatus, StatusLabel> = {
  supported: {
    label: "Fully Supported",
    severity: "info",
    summary:
      "This model runs with full performance on your hardware. GPU acceleration and full context window are available.",
  },
  supported_with_limits: {
    label: "Supported with Limits",
    severity: "warning",
    summary:
      "This model can run but with reduced performance. Context window, GPU offload, or throughput may be limited.",
  },
  cpu_only_slow: {
    label: "CPU Only — Slow",
    severity: "warning",
    summary:
      "No viable GPU offload. The model will run entirely on CPU with significantly slower inference (5–20× slower).",
  },
  unsupported: {
    label: "Unsupported",
    severity: "error",
    summary:
      "Your hardware does not meet the minimum requirements. The model cannot run reliably.",
  },
};

// ─── Workflow status labels ─────────────────────────────────────────────

export const WORKFLOW_STATUS_LABELS: Record<WorkflowViewStatus, StatusLabel> = {
  completed: {
    label: "Completed",
    severity: "info",
    summary: "Workflow completed successfully. All stages passed.",
  },
  completed_requires_approval: {
    label: "Completed — Requires Approval",
    severity: "warning",
    summary:
      "Workflow completed but the install plan contains steps that require human approval before execution.",
  },
  blocked: {
    label: "Blocked",
    severity: "critical",
    summary:
      "Workflow is blocked. The install plan contains unsafe steps that cannot proceed.",
  },
  failed: {
    label: "Failed",
    severity: "error",
    summary: "Workflow failed at one of its stages. See error details.",
  },
  partial: {
    label: "Partial",
    severity: "info",
    summary:
      "Workflow was intentionally stopped early. Only a subset of stages were executed.",
  },
};

// ─── Safety status labels ───────────────────────────────────────────────

export const SAFETY_STATUS_LABELS: Record<SafetyStatus, StatusLabel> = {
  approved: {
    label: "Approved",
    severity: "info",
    summary: "The install plan passed safety evaluation. No issues found.",
  },
  requiresHumanApproval: {
    label: "Requires Human Approval",
    severity: "warning",
    summary:
      "The install plan contains steps that need human review before proceeding.",
  },
  blocked: {
    label: "Blocked",
    severity: "critical",
    summary:
      "The install plan contains blocked operations and cannot proceed.",
  },
};

// ─── Risk level to severity mapping ─────────────────────────────────────

export const RISK_SEVERITY: Record<RiskLevel, Severity> = {
  safe: "info",
  caution: "warning",
  dangerous: "error",
  blocked: "critical",
};

// ─── Workflow stage labels ──────────────────────────────────────────────

export const STAGE_LABELS: Record<WorkflowStageName, string> = {
  catalog_loading: "Loading Catalog",
  host_acquisition: "Detecting Host",
  recommendation: "Generating Recommendations",
  target_selection: "Selecting Target",
  compatibility_evaluation: "Evaluating Compatibility",
  install_planning: "Planning Installation",
  safety_evaluation: "Evaluating Safety",
  rendering: "Rendering Plan",
};
