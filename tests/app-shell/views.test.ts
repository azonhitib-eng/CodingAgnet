/**
 * App shell view renderer tests.
 *
 * Validates that the HTML template renders correctly with essential
 * elements and structure.
 */

import { describe, it, expect } from "vitest";

import { renderShellHtml } from "../../src/app-shell/views.js";

describe("renderShellHtml", () => {
  const html = renderShellHtml();

  it("returns a valid HTML document", () => {
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("includes the page title", () => {
    expect(html).toContain("<title>CodingAgent");
  });

  it("includes the header with app name", () => {
    expect(html).toContain("CodingAgent");
    expect(html).toContain("Local Model Compatibility");
  });

  it("includes the scenario selector", () => {
    expect(html).toContain("scenario-select");
    expect(html).toContain("<select");
  });

  it("includes the main app container", () => {
    expect(html).toContain('id="app"');
  });

  it("includes embedded CSS", () => {
    expect(html).toContain("<style>");
    expect(html).toContain("--bg:");
    expect(html).toContain(".card");
  });

  it("includes client-side JavaScript", () => {
    expect(html).toContain("<script>");
    expect(html).toContain("fetchJson");
    expect(html).toContain("/api/scenarios");
  });

  it("includes render functions for all views", () => {
    expect(html).toContain("renderHost");
    expect(html).toContain("renderRecommendation");
    expect(html).toContain("renderCompatibility");
    expect(html).toContain("renderPlan");
    expect(html).toContain("renderWorkflow");
  });

  it("uses XSS-safe text escaping", () => {
    expect(html).toContain("function esc(s)");
    expect(html).toContain("textContent");
  });

  // ── Phase 13: new UI elements ───────────────────────────────────────

  it("includes mode selector (demo vs real)", () => {
    expect(html).toContain('id="mode-select"');
    expect(html).toContain("Demo");
    expect(html).toContain("Real");
  });

  it("includes demo controls container", () => {
    expect(html).toContain('id="demo-controls"');
  });

  it("includes real mode controls container", () => {
    expect(html).toContain('id="real-controls"');
  });

  it("includes data directory input", () => {
    expect(html).toContain('id="data-dir-input"');
  });

  it("includes host file input", () => {
    expect(html).toContain('id="host-file-input"');
  });

  it("includes artifact ID input", () => {
    expect(html).toContain('id="artifact-input"');
  });

  it("includes stop-after stage selector", () => {
    expect(html).toContain('id="stop-after-input"');
  });

  it("includes run workflow button", () => {
    expect(html).toContain('id="run-workflow-btn"');
    expect(html).toContain("Run Workflow");
  });

  it("includes validate inputs button", () => {
    expect(html).toContain('id="validate-btn"');
    expect(html).toContain("Validate Inputs");
  });

  it("includes mode switching JavaScript", () => {
    expect(html).toContain("mode-select");
    expect(html).toContain("demo-controls");
    expect(html).toContain("real-controls");
  });

  it("includes real workflow API integration", () => {
    expect(html).toContain("/api/workflow/run");
    expect(html).toContain("/api/workflow/validate");
    expect(html).toContain("/api/stages");
  });

  it("includes error rendering for real mode", () => {
    expect(html).toContain("renderError");
  });

  it("includes postJson helper for POST requests", () => {
    expect(html).toContain("postJson");
  });
});
