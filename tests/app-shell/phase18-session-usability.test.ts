/**
 * Phase 18 — Product-shell polish and session usability tests.
 *
 * Tests:
 *   - Navigation/jump behavior: section nav, section IDs
 *   - Export/copy behavior: export bar, download helpers, copy summary
 *   - Session persistence: run-context, _lastRunMeta tracking
 *   - Recovery/error UX: recovery hints, contextual error guidance
 *   - Import host profile: file input in real mode
 *   - Clear results vs reset form distinction
 *   - Summary strip for quick scanning
 *   - No regression in demo vs real mode
 */

import { describe, it, expect } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

import { renderShellHtml } from "../../src/app-shell/views.js";
import { handleRequest } from "../../src/app-shell/server.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const html = renderShellHtml();

function fakeRequest(method: string, url: string): IncomingMessage {
  const req = new IncomingMessage(new Socket());
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:3000" };
  return req;
}

function fakeResponse(): ServerResponse & { _body: string; _status: number } {
  const res = new ServerResponse(fakeRequest("GET", "/")) as ServerResponse & {
    _body: string;
    _status: number;
  };
  res._body = "";
  res._status = 200;

  const origWriteHead = res.writeHead.bind(res);
  res.writeHead = function (statusCode: number, ...args: unknown[]): ServerResponse {
    res._status = statusCode;
    return origWriteHead(statusCode, ...(args as [Record<string, string>]));
  } as typeof res.writeHead;

  const origEnd = res.end.bind(res);
  res.end = function (chunk?: unknown, ...args: unknown[]): ServerResponse {
    if (typeof chunk === "string") {
      res._body = chunk;
    } else if (Buffer.isBuffer(chunk)) {
      res._body = chunk.toString("utf-8");
    }
    return origEnd(chunk, ...(args as [BufferEncoding, () => void]));
  } as typeof res.end;

  return res;
}

// ---------------------------------------------------------------------------
// 1. Navigation / section nav
// ---------------------------------------------------------------------------

describe("Phase 18: Section navigation", () => {
  it("includes section-nav element in HTML", () => {
    expect(html).toContain('id="section-nav"');
    expect(html).toContain('class="section-nav"');
  });

  it("section nav is hidden by default", () => {
    expect(html).toContain('id="section-nav" class="section-nav" style="display:none;"');
  });

  it("includes showSectionNav function in client JS", () => {
    expect(html).toContain("showSectionNav");
  });

  it("includes hideSectionNav function in client JS", () => {
    expect(html).toContain("hideSectionNav");
  });

  it("defines all section jump targets", () => {
    expect(html).toContain("section-host");
    expect(html).toContain("section-recommendation");
    expect(html).toContain("section-compatibility");
    expect(html).toContain("section-plan");
    expect(html).toContain("section-workflow");
  });

  it("section nav labels are defined", () => {
    expect(html).toContain("label:'Host'");
    expect(html).toContain("label:'Recommendation'");
    expect(html).toContain("label:'Compatibility'");
    expect(html).toContain("label:'Plan Review'");
    expect(html).toContain("label:'Workflow'");
  });

  it("render functions assign section IDs to cards", () => {
    // renderHost
    expect(html).toContain('id="section-host"');
    // renderRecommendation
    expect(html).toContain('id="section-recommendation"');
    // renderCompatibility
    expect(html).toContain('id="section-compatibility"');
    // renderPlan
    expect(html).toContain('id="section-plan"');
    // renderWorkflow
    expect(html).toContain('id="section-workflow"');
  });

  it("includes IntersectionObserver for active section tracking", () => {
    expect(html).toContain("IntersectionObserver");
  });

  it("section nav has sticky CSS", () => {
    expect(html).toContain("section-nav");
    expect(html).toContain("position: sticky");
    expect(html).toContain("z-index: 10");
  });

  it("hides section nav on mode switch", () => {
    // switchMode function should call hideSectionNav
    expect(html).toContain("hideSectionNav()");
  });
});

// ---------------------------------------------------------------------------
// 2. Session-level usability
// ---------------------------------------------------------------------------

describe("Phase 18: Session and run context", () => {
  it("includes run-context CSS class", () => {
    expect(html).toContain("run-context");
    expect(html).toContain(".run-context");
  });

  it("includes run-label and run-meta CSS", () => {
    expect(html).toContain(".run-context .run-label");
    expect(html).toContain(".run-context .run-meta");
  });

  it("includes renderRunContext function", () => {
    expect(html).toContain("renderRunContext");
  });

  it("run context includes mode label", () => {
    expect(html).toContain("run-label");
    expect(html).toContain("Demo");
    expect(html).toContain("Real");
  });

  it("run context includes timestamp", () => {
    expect(html).toContain("timestamp");
    expect(html).toContain("toLocaleString");
  });

  it("tracks _lastRunMeta", () => {
    expect(html).toContain("_lastRunMeta");
  });

  it("sets meta on demo scenario load", () => {
    // The demo scenario handler sets _lastRunMeta
    expect(html).toContain("mode: 'demo'");
    expect(html).toContain("label: data.label");
  });

  it("sets meta on real workflow run", () => {
    // The run workflow handler sets _lastRunMeta
    expect(html).toContain("mode: 'real'");
    expect(html).toContain("label: 'Real Workflow'");
  });

  it("includes Clear Results button", () => {
    expect(html).toContain('id="clear-results-btn"');
    expect(html).toContain("Clear Results");
  });

  it("clear-results button is distinct from reset button", () => {
    expect(html).toContain('id="reset-form-btn"');
    expect(html).toContain('id="clear-results-btn"');
  });

  it("clear-results preserves form inputs (only clears app area)", () => {
    // The clear-results handler should not reset form inputs
    expect(html).toContain("$clearResultsBtn.addEventListener");
  });

  it("reset button clears all inputs and results", () => {
    expect(html).toContain("$resetBtn.addEventListener");
    expect(html).toContain("$dataDirInput.value = ''");
  });
});

// ---------------------------------------------------------------------------
// 3. Export / import conveniences
// ---------------------------------------------------------------------------

describe("Phase 18: Export and import", () => {
  it("includes export-bar CSS class", () => {
    expect(html).toContain(".export-bar");
  });

  it("includes renderExportBar function", () => {
    expect(html).toContain("renderExportBar");
  });

  it("includes Export Result JSON button", () => {
    expect(html).toContain("Export Result JSON");
    expect(html).toContain("__exportResult");
  });

  it("includes Export Host JSON button", () => {
    expect(html).toContain("Export Host JSON");
    expect(html).toContain("__exportHost");
  });

  it("includes Copy Summary Text button", () => {
    expect(html).toContain("Copy Summary Text");
    expect(html).toContain("__copyResultText");
  });

  it("downloadJson function creates Blob and triggers download", () => {
    expect(html).toContain("downloadJson");
    expect(html).toContain("Blob");
    expect(html).toContain("createObjectURL");
    expect(html).toContain("revokeObjectURL");
  });

  it("export result generates timestamped filename", () => {
    expect(html).toContain("workflow-result-");
  });

  it("export host generates timestamped filename", () => {
    expect(html).toContain("host-profile-");
  });

  it("copy summary text compiles host/recommendation/compatibility/workflow", () => {
    expect(html).toContain("Host: ");
    expect(html).toContain("Recommendation: ");
    expect(html).toContain("Compatibility: ");
    expect(html).toContain("Status: ");
  });

  it("includes import host file input", () => {
    expect(html).toContain('id="import-host-file"');
    expect(html).toContain('accept=".json,application/json"');
  });

  it("includes import host status indicator", () => {
    expect(html).toContain('id="import-host-status"');
  });

  it("import handler reads file and validates via backend", () => {
    expect(html).toContain("$importHostFile.addEventListener");
    expect(html).toContain("FileReader");
    expect(html).toContain("/api/host/validate");
  });

  it("import success sets detected host profile", () => {
    expect(html).toContain("loaded successfully");
  });

  it("import error shows validation failure message", () => {
    expect(html).toContain("Invalid:");
  });

  it("preserves existing Copy JSON button", () => {
    expect(html).toContain("copy-btn");
    expect(html).toContain("Copy JSON");
    expect(html).toContain("__copyData");
  });
});

// ---------------------------------------------------------------------------
// 4. Comparison / readability
// ---------------------------------------------------------------------------

describe("Phase 18: Comparison and readability", () => {
  it("includes summary-strip CSS class", () => {
    expect(html).toContain(".summary-strip");
  });

  it("includes renderSummaryStrip function", () => {
    expect(html).toContain("renderSummaryStrip");
  });

  it("summary strip shows status icon and label", () => {
    expect(html).toContain("ss-status");
  });

  it("summary strip shows host summary", () => {
    expect(html).toContain("ss-item");
    expect(html).toContain("data.host.summary");
  });

  it("summary strip shows recommendation name", () => {
    expect(html).toContain("data.recommendation.displayName");
  });

  it("summary strip shows compatibility label", () => {
    expect(html).toContain("data.compatibility.label");
  });

  it("renderScenario includes summary strip", () => {
    // renderScenario calls renderSummaryStrip
    expect(html).toContain("renderSummaryStrip(data)");
  });

  it("renderScenario includes run context", () => {
    expect(html).toContain("renderRunContext(_lastRunMeta)");
  });

  it("renderScenario includes export bar", () => {
    expect(html).toContain("renderExportBar(data)");
  });
});

// ---------------------------------------------------------------------------
// 5. Error and recovery UX
// ---------------------------------------------------------------------------

describe("Phase 18: Error and recovery UX", () => {
  it("includes RECOVERY_HINTS mapping", () => {
    expect(html).toContain("RECOVERY_HINTS");
  });

  it("includes getRecoveryHint function", () => {
    expect(html).toContain("getRecoveryHint");
  });

  it("has recovery hint for missing/wrong data-dir", () => {
    expect(html).toContain("missing required subdirectories");
    expect(html).toContain("models/, runtimes/, and agent-tools/");
  });

  it("has recovery hint for stale/missing host file", () => {
    expect(html).toContain("Host file does not exist");
    expect(html).toContain("Detect Host");
    expect(html).toContain("generate-host-profile");
  });

  it("has recovery hint for invalid host file", () => {
    expect(html).toContain("Invalid host file");
    expect(html).toContain("Regenerate");
  });

  it("has recovery hint for not-found artifact", () => {
    expect(html).toContain("not found in the catalog");
    expect(html).toContain("auto-recommendation");
  });

  it("has recovery hint for path does not exist", () => {
    expect(html).toContain("does not exist");
    expect(html).toContain("absolute paths");
  });

  it("recovery hint renders with recovery-hint CSS class", () => {
    expect(html).toContain("recovery-hint");
    expect(html).toContain(".recovery-hint");
  });

  it("renderError includes recovery hint lookup", () => {
    // renderError should call getRecoveryHint
    expect(html).toContain("getRecoveryHint(err)");
  });

  it("partial workflow hints are clearer", () => {
    expect(html).toContain("stopped early");
  });

  it("blocked workflow hints warn against execution", () => {
    expect(html).toContain("Do NOT execute");
  });

  it("preserves existing error hints for known error codes", () => {
    expect(html).toContain("INVALID_INPUT");
    expect(html).toContain("MISSING_ARTIFACT");
    expect(html).toContain("MISSING_RUNTIME");
    expect(html).toContain("BLOCKED_BY_POLICY");
    expect(html).toContain("INTERNAL_FAILURE");
  });
});

// ---------------------------------------------------------------------------
// 6. No regression: demo and real mode
// ---------------------------------------------------------------------------

describe("Phase 18: No regression — demo mode", () => {
  it("demo mode controls still present", () => {
    expect(html).toContain('id="demo-controls"');
    expect(html).toContain('id="scenario-select"');
  });

  it("demo mode hint text still present", () => {
    expect(html).toContain("Explore pre-built scenarios");
  });

  it("scenario loading still functional in client JS", () => {
    expect(html).toContain("/api/scenarios");
    expect(html).toContain("fetchJson");
  });

  it("demo mode still renders via renderScenario", () => {
    expect(html).toContain("renderScenario(data)");
  });

  it("GET / still returns HTML with full page structure", () => {
    const req = fakeRequest("GET", "/");
    const res = fakeResponse();
    handleRequest(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toContain("<!DOCTYPE html>");
    expect(res._body).toContain("CodingAgent");
  });
});

describe("Phase 18: No regression — real mode", () => {
  it("real mode controls still present", () => {
    expect(html).toContain('id="real-controls"');
    expect(html).toContain('id="data-dir-input"');
    expect(html).toContain('id="host-file-input"');
    expect(html).toContain('id="artifact-input"');
    expect(html).toContain('id="stop-after-input"');
  });

  it("real mode hint text still present", () => {
    expect(html).toContain("Run the real backend workflow");
  });

  it("real mode form actions still present", () => {
    expect(html).toContain('id="run-workflow-btn"');
    expect(html).toContain('id="validate-btn"');
    expect(html).toContain('id="reset-form-btn"');
  });

  it("detect host button still present", () => {
    expect(html).toContain('id="detect-host-btn"');
    expect(html).toContain("Detect Host");
  });

  it("host source indicator still present", () => {
    expect(html).toContain('id="host-source-indicator"');
  });

  it("validation result area still present", () => {
    expect(html).toContain('id="validation-result"');
  });

  it("localStorage persistence still present", () => {
    expect(html).toContain("STORAGE_KEY");
    expect(html).toContain("codingagent_shell_prefs");
    expect(html).toContain("localStorage");
  });

  it("mode switching still present", () => {
    expect(html).toContain("switchMode");
    expect(html).toContain("mode-select");
  });

  it("GET /api/scenarios still returns demo list", () => {
    const req = fakeRequest("GET", "/api/scenarios");
    const res = fakeResponse();
    handleRequest(req, res);
    expect(res._status).toBe(200);
    const data = JSON.parse(res._body);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("GET /api/stages still returns stage names", () => {
    const req = fakeRequest("GET", "/api/stages");
    const res = fakeResponse();
    handleRequest(req, res);
    expect(res._status).toBe(200);
    const data = JSON.parse(res._body);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toContain("catalog_loading");
  });
});

// ---------------------------------------------------------------------------
// 7. CSS additions
// ---------------------------------------------------------------------------

describe("Phase 18: CSS additions", () => {
  it("includes section-nav CSS", () => {
    expect(html).toContain(".section-nav {");
    expect(html).toContain(".section-nav a {");
  });

  it("includes run-context CSS", () => {
    expect(html).toContain(".run-context {");
  });

  it("includes summary-strip CSS", () => {
    expect(html).toContain(".summary-strip {");
  });

  it("includes export-bar CSS", () => {
    expect(html).toContain(".export-bar {");
  });

  it("includes recovery-hint CSS", () => {
    expect(html).toContain(".recovery-hint {");
  });

  it("export-bar hides file input", () => {
    expect(html).toContain('.export-bar input[type="file"] { display: none; }');
  });
});

// ---------------------------------------------------------------------------
// 8. HTML structure
// ---------------------------------------------------------------------------

describe("Phase 18: HTML structure additions", () => {
  it("section-nav is placed before main#app", () => {
    const navIdx = html.indexOf('id="section-nav"');
    const mainIdx = html.indexOf('id="app"');
    expect(navIdx).toBeGreaterThan(-1);
    expect(mainIdx).toBeGreaterThan(-1);
    expect(navIdx).toBeLessThan(mainIdx);
  });

  it("import host file input is inside real-controls", () => {
    const realCtrlStart = html.indexOf('id="real-controls"');
    const importIdx = html.indexOf('id="import-host-file"');
    const realCtrlEnd = html.indexOf('id="section-nav"');
    expect(importIdx).toBeGreaterThan(realCtrlStart);
    expect(importIdx).toBeLessThan(realCtrlEnd);
  });

  it("clear-results button is inside real-controls form-actions", () => {
    const resetIdx = html.indexOf('id="reset-form-btn"');
    const clearIdx = html.indexOf('id="clear-results-btn"');
    expect(clearIdx).toBeGreaterThan(resetIdx); // clear is after reset
  });
});
