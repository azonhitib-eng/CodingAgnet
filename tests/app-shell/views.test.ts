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
});
