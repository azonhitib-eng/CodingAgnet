/**
 * Phase 14 — UX hardening tests for the app shell view renderer.
 *
 * Validates the improved status clarity, blocked/approval presentation,
 * form usability, error rendering, and convenience features.
 */

import { describe, it, expect } from "vitest";

import { renderShellHtml } from "../../src/app-shell/views.js";

const html = renderShellHtml();

// ---------------------------------------------------------------------------
// 1. Status clarity improvements
// ---------------------------------------------------------------------------

describe("Phase 14: Status clarity", () => {
  it("includes stage progress bar markup", () => {
    expect(html).toContain("stage-bar");
    expect(html).toContain("stage-segment");
  });

  it("includes stage progress label rendering", () => {
    expect(html).toContain("progress-label");
    expect(html).toContain("Stage progress:");
  });

  it("includes status icon mapping for all workflow statuses", () => {
    // STATUS_CONFIG keys
    expect(html).toContain("completed:");
    expect(html).toContain("completed_requires_approval:");
    expect(html).toContain("blocked:");
    expect(html).toContain("failed:");
    expect(html).toContain("partial:");
  });

  it("includes next-action guidance in workflow render", () => {
    expect(html).toContain("next-action");
    expect(html).toContain("What to do next");
  });

  it("renders failed stage with badge and icon", () => {
    expect(html).toContain("failedStage");
    expect(html).toContain("badge-error");
    expect(html).toContain("FAILED");
  });

  it("has distinct stage icon classes (done, pending, fail)", () => {
    expect(html).toContain("stage-icon");
    expect(html).toContain("done");
    expect(html).toContain("pending");
    expect(html).toContain("fail");
  });
});

// ---------------------------------------------------------------------------
// 2. Blocked / requires-approval UX
// ---------------------------------------------------------------------------

describe("Phase 14: Blocked and requires-approval UX", () => {
  it("includes card-blocked CSS class", () => {
    expect(html).toContain("card-blocked");
  });

  it("includes card-approval CSS class", () => {
    expect(html).toContain("card-approval");
  });

  it("includes blocked-box rendering for blocked safety", () => {
    expect(html).toContain("blocked-box");
    expect(html).toContain("blocked-title");
    expect(html).toContain("BLOCKED");
    expect(html).toContain("Unsafe Operations Detected");
  });

  it("includes warning-box rendering for requires-approval safety", () => {
    expect(html).toContain("warning-box");
    expect(html).toContain("Requires Human Approval");
  });

  it("applies distinct styling for blocked and approval workflow cards", () => {
    // The workflow render function uses getStatusConfig to set cardClass
    expect(html).toContain("sc.cardClass");
  });

  it("has separate CSS variables for blocked state", () => {
    expect(html).toContain("--blocked-bg");
    expect(html).toContain("--blocked-border");
    expect(html).toContain("--blocked-fg");
  });

  it("has separate CSS variables for approval state", () => {
    expect(html).toContain("--approval-bg");
    expect(html).toContain("--approval-border");
    expect(html).toContain("--approval-fg");
  });

  it("applies step-level styling for approval and blocked steps", () => {
    expect(html).toContain("step-approval");
    expect(html).toContain("step-blocked");
  });

  it("shows irreversibility marker on plan steps", () => {
    expect(html).toContain("irreversible");
  });
});

// ---------------------------------------------------------------------------
// 3. Form usability improvements
// ---------------------------------------------------------------------------

describe("Phase 14: Form usability", () => {
  it("uses fieldset grouping for required vs optional inputs", () => {
    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend>");
    expect(html).toContain("Required Inputs");
    expect(html).toContain("Optional");
  });

  it("includes field hint text for each input", () => {
    expect(html).toContain("field-hint");
    expect(html).toContain("models/");
    expect(html).toContain("runtimes/");
    expect(html).toContain("agent-tools/");
    expect(html).toContain("HostProfile");
    expect(html).toContain("auto-recommendation");
  });

  it("includes reset form button", () => {
    expect(html).toContain('id="reset-form-btn"');
    expect(html).toContain("Reset");
  });

  it("includes form-actions container for buttons", () => {
    expect(html).toContain("form-actions");
  });

  it("includes mode hint text", () => {
    expect(html).toContain('id="mode-hint"');
    expect(html).toContain("mode-hint");
  });

  it("includes input-error class for field highlighting", () => {
    expect(html).toContain("input-error");
  });

  it("disables buttons during workflow execution", () => {
    expect(html).toContain("$runBtn.disabled = true");
    expect(html).toContain("$validateBtn.disabled = true");
  });

  it("clears error styling on input", () => {
    expect(html).toContain("classList.remove('input-error')");
  });

  it("includes reset form handler that clears all inputs", () => {
    expect(html).toContain("reset-form-btn");
    expect(html).toContain("$dataDirInput.value = ''");
    expect(html).toContain("$hostFileInput.value = ''");
  });
});

// ---------------------------------------------------------------------------
// 4. Validation and error presentation
// ---------------------------------------------------------------------------

describe("Phase 14: Validation and error presentation", () => {
  it("includes error hints for each error code", () => {
    expect(html).toContain("ERROR_HINTS");
    expect(html).toContain("INVALID_INPUT");
    expect(html).toContain("MISSING_ARTIFACT");
    expect(html).toContain("MISSING_RUNTIME");
    expect(html).toContain("BLOCKED_BY_POLICY");
    expect(html).toContain("INTERNAL_FAILURE");
  });

  it("includes structured error title and hint", () => {
    expect(html).toContain("error-title");
    expect(html).toContain("error-hint");
  });

  it("includes collapsible details for error objects", () => {
    expect(html).toContain("collapsible");
    expect(html).toContain("Show details");
    expect(html).toContain("collapsible-body");
  });

  it("includes validation result color classes", () => {
    expect(html).toContain("vr-ok");
    expect(html).toContain("vr-err");
    expect(html).toContain("vr-mix");
  });

  it("includes validation hints for common fields", () => {
    expect(html).toContain("VALIDATION_HINTS");
    expect(html).toContain("dataDir");
    expect(html).toContain("hostFile");
    expect(html).toContain("stopAfter");
  });

  it("renders missing required fields with structured error", () => {
    expect(html).toContain("Missing required fields");
    expect(html).toContain("Data Directory");
    expect(html).toContain("Host Profile File");
  });
});

// ---------------------------------------------------------------------------
// 5. Convenience features
// ---------------------------------------------------------------------------

describe("Phase 14: Convenience features", () => {
  it("includes copy JSON button", () => {
    expect(html).toContain("copy-btn");
    expect(html).toContain("Copy JSON");
    expect(html).toContain("__copyData");
    expect(html).toContain("json-result");
  });

  it("includes clipboard API usage", () => {
    expect(html).toContain("navigator.clipboard.writeText");
    expect(html).toContain("Copied!");
  });

  it("includes localStorage persistence", () => {
    expect(html).toContain("localStorage");
    expect(html).toContain("codingagent_shell_prefs");
    expect(html).toContain("loadPrefs");
    expect(html).toContain("savePrefs");
    expect(html).toContain("restoreInputs");
    expect(html).toContain("persistInputs");
  });

  it("includes collapsible CSS and toggle mechanism", () => {
    expect(html).toContain(".collapsible");
    expect(html).toContain("classList.toggle");
    expect(html).toContain(".collapsible.open");
  });

  it("includes mode hint descriptions", () => {
    expect(html).toContain("MODE_HINTS");
    expect(html).toContain("no setup required");
    expect(html).toContain("real backend workflow");
  });
});

// ---------------------------------------------------------------------------
// 6. Demo mode preserved
// ---------------------------------------------------------------------------

describe("Phase 14: Demo mode preserved", () => {
  it("still includes demo mode option and controls", () => {
    expect(html).toContain("Demo");
    expect(html).toContain("demo-controls");
    expect(html).toContain("scenario-select");
  });

  it("still fetches scenarios from /api/scenarios", () => {
    expect(html).toContain("/api/scenarios");
    expect(html).toContain("initDemo");
  });

  it("still renders all view sections for demo scenarios", () => {
    expect(html).toContain("renderHost");
    expect(html).toContain("renderRecommendation");
    expect(html).toContain("renderCompatibility");
    expect(html).toContain("renderPlan");
    expect(html).toContain("renderWorkflow");
    expect(html).toContain("renderScenario");
  });

  it("still loads stage names for real mode dropdown", () => {
    expect(html).toContain("/api/stages");
    expect(html).toContain("initStages");
  });
});

// ---------------------------------------------------------------------------
// 7. Backward compatibility with existing elements
// ---------------------------------------------------------------------------

describe("Phase 14: Backward compatibility", () => {
  it("preserves existing element IDs", () => {
    expect(html).toContain('id="mode-select"');
    expect(html).toContain('id="demo-controls"');
    expect(html).toContain('id="real-controls"');
    expect(html).toContain('id="scenario-select"');
    expect(html).toContain('id="scenario-desc"');
    expect(html).toContain('id="app"');
    expect(html).toContain('id="data-dir-input"');
    expect(html).toContain('id="host-file-input"');
    expect(html).toContain('id="artifact-input"');
    expect(html).toContain('id="stop-after-input"');
    expect(html).toContain('id="run-workflow-btn"');
    expect(html).toContain('id="validate-btn"');
    expect(html).toContain('id="validation-result"');
  });

  it("preserves XSS-safe escaping function", () => {
    expect(html).toContain("function esc(s)");
    expect(html).toContain("textContent");
  });

  it("preserves fetchJson and postJson helpers", () => {
    expect(html).toContain("fetchJson");
    expect(html).toContain("postJson");
  });

  it("preserves badge rendering function", () => {
    expect(html).toContain("function badge");
    expect(html).toContain("badge-info");
    expect(html).toContain("badge-warning");
    expect(html).toContain("badge-error");
    expect(html).toContain("badge-critical");
  });

  it("preserves API endpoint paths", () => {
    expect(html).toContain("/api/scenarios");
    expect(html).toContain("/api/stages");
    expect(html).toContain("/api/workflow/run");
    expect(html).toContain("/api/workflow/validate");
  });
});

// ---------------------------------------------------------------------------
// 8. CSS enhancements
// ---------------------------------------------------------------------------

describe("Phase 14: CSS enhancements", () => {
  it("includes success badge class", () => {
    expect(html).toContain("badge-success");
  });

  it("includes focus ring styling for inputs", () => {
    expect(html).toContain("box-shadow");
    expect(html).toContain(":focus");
  });

  it("includes disabled button styling", () => {
    expect(html).toContain(":disabled");
    expect(html).toContain("cursor: not-allowed");
  });
});
