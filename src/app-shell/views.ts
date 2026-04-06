/**
 * App shell HTML renderer.
 *
 * Generates the single-page HTML application that the shell serves.
 * Uses vanilla HTML/CSS/JS — no framework dependencies.
 * Data is fetched from the JSON API endpoints.
 *
 * Phase 14: UX hardening — improved status clarity, blocked/approval UX,
 * form usability, validation/error presentation, and convenience features.
 */

// ---------------------------------------------------------------------------
// Main HTML page
// ---------------------------------------------------------------------------

export function renderShellHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CodingAgent — App Shell</title>
<style>
${CSS}
</style>
</head>
<body>
<header>
  <h1>CodingAgent</h1>
  <p class="subtitle">Local Model Compatibility &amp; Install Planner</p>
</header>
<nav id="mode-nav">
  <label for="mode-select">Mode:</label>
  <select id="mode-select">
    <option value="demo">Demo</option>
    <option value="real">Real</option>
  </select>
  <span id="mode-hint" class="mode-hint">Explore pre-built scenarios — no setup required.</span>
</nav>
<div id="demo-controls">
  <nav id="scenario-nav">
    <label for="scenario-select">Scenario:</label>
    <select id="scenario-select"><option value="">Loading…</option></select>
    <span id="scenario-desc" class="muted"></span>
  </nav>
</div>
<div id="real-controls" style="display:none;">
  <div class="real-form">
    <fieldset class="form-group">
      <legend>Required Inputs</legend>
      <div class="form-row">
        <label for="data-dir-input">Data Directory</label>
        <input type="text" id="data-dir-input" placeholder="path/to/data" />
        <span class="field-hint">Directory containing <code>models/</code>, <code>runtimes/</code>, <code>agent-tools/</code></span>
      </div>
      <div class="form-row">
        <label for="host-file-input">Host Profile File</label>
        <input type="text" id="host-file-input" placeholder="path/to/host-profile.json" />
        <span class="field-hint">JSON file with a valid HostProfile — or use Detect Host below</span>
      </div>
    </fieldset>
    <fieldset class="form-group">
      <legend>Host Detection</legend>
      <p class="field-hint" style="padding-left:0;margin-bottom:.4rem;">Detect your current machine's hardware instead of providing a host file.</p>
      <div class="form-actions" style="margin-top:0;">
        <button id="detect-host-btn" type="button" class="btn-secondary">Detect Host</button>
      </div>
      <div class="form-row" style="margin-top:.5rem;">
        <label>Import Host JSON</label>
        <div class="export-bar">
          <label for="import-host-file">Choose File\u2026<input type="file" id="import-host-file" accept=".json,application/json"></label>
          <span id="import-host-status" class="muted"></span>
        </div>
      </div>
      <div id="host-source-indicator" style="display:none;"></div>
      <div id="detect-result" style="display:none;"></div>
    </fieldset>
    <fieldset class="form-group">
      <legend>Optional</legend>
      <div class="form-row">
        <label for="artifact-input">Artifact ID</label>
        <input type="text" id="artifact-input" placeholder="e.g. codellama-7b-q4_k_m-ollama" />
        <span class="field-hint">Leave empty for auto-recommendation</span>
      </div>
      <div class="form-row">
        <label for="stop-after-input">Stop After Stage</label>
        <select id="stop-after-input"><option value="">— run all stages —</option></select>
        <span class="field-hint">Stop workflow early at a specific stage</span>
      </div>
    </fieldset>
    <div class="form-actions">
      <button id="run-workflow-btn" type="button">Run Workflow</button>
      <button id="validate-btn" type="button" class="btn-secondary">Validate Inputs</button>
      <button id="reset-form-btn" type="button" class="btn-secondary">Reset</button>
      <button id="clear-results-btn" type="button" class="btn-secondary">Clear Results</button>
    </div>
    <div id="validation-result" style="display:none;"></div>
  </div>
</div>
<nav id="section-nav" class="section-nav" style="display:none;"></nav>
<div id="session-panel" style="max-width:960px;margin:0 auto;padding:0 1.5rem;">
  <div id="console-status-header" class="console-status-header" style="display:none;"></div>
  <div id="console-presence-bar" class="console-presence-bar" style="display:none;"></div>
  <div id="console-filter-bar" class="console-filter-bar" style="display:none;"></div>
  <!-- Phase 28: Command Composer -->
  <div id="command-composer" class="command-composer" style="display:none;">
    <h3 class="command-composer-title">⚡ Command Composer</h3>
    <div class="command-composer-bar">
      <select id="command-select" class="command-select">
        <option value="">— Select command —</option>
      </select>
      <button id="command-submit-btn" type="button" class="btn-primary command-submit-btn" disabled>Run</button>
    </div>
    <div id="command-description" class="command-description"></div>
    <div id="command-fields" class="command-fields"></div>
    <div id="command-validation" class="command-validation" style="display:none;"></div>
    <div id="command-result" class="command-result" style="display:none;"></div>
  </div>
  <div id="session-console-container"></div>
  <div id="session-summary-container"></div>
  <div id="session-timeline-container"></div>
</div>
<main id="app">
  <p class="muted">Select a scenario above to begin.</p>
</main>
<script>
${CLIENT_JS}
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const CSS = `
:root {
  --bg: #f8f9fa; --fg: #212529; --muted: #6c757d;
  --card-bg: #fff; --card-border: #dee2e6; --card-radius: 6px;
  --accent: #0d6efd; --success: #198754; --warning: #ffc107;
  --danger: #dc3545; --critical: #6f42c1; --info: #0dcaf0;
  --blocked-bg: #f3e8ff; --blocked-border: #c084fc; --blocked-fg: #581c87;
  --approval-bg: #fef9c3; --approval-border: #facc15; --approval-fg: #713f12;
  font-family: system-ui, -apple-system, sans-serif;
}
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); }
header {
  background: var(--fg); color: var(--bg); padding: 1rem 1.5rem;
}
header h1 { margin: 0; font-size: 1.4rem; }
header .subtitle { margin: .25rem 0 0; font-size: .85rem; opacity: .7; }
nav { padding: .75rem 1.5rem; border-bottom: 1px solid var(--card-border); background: var(--card-bg); display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
nav label { font-weight: 600; }
nav select { padding: .35rem .5rem; border-radius: 4px; border: 1px solid var(--card-border); }
.muted { color: var(--muted); font-size: .85rem; }
main { padding: 1.5rem; max-width: 960px; margin: 0 auto; }
.card {
  background: var(--card-bg); border: 1px solid var(--card-border);
  border-radius: var(--card-radius); padding: 1rem 1.25rem; margin-bottom: 1rem;
}
.card h2 { margin: 0 0 .5rem; font-size: 1.1rem; }
.card h3 { margin: .75rem 0 .25rem; font-size: .95rem; }
.card-blocked {
  background: var(--blocked-bg); border-color: var(--blocked-border);
}
.card-approval {
  background: var(--approval-bg); border-color: var(--approval-border);
}
.card-error {
  background: #fef2f2; border-color: #fca5a5;
}
.badge {
  display: inline-block; padding: .2rem .6rem; border-radius: 3px;
  font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .02em;
}
.badge-info { background: #cff4fc; color: #055160; }
.badge-success { background: #d1e7dd; color: #0f5132; }
.badge-warning { background: #fff3cd; color: #664d03; }
.badge-error { background: #f8d7da; color: #842029; }
.badge-critical { background: #e2d9f3; color: #432874; }
dl { margin: .5rem 0; }
dt { font-weight: 600; font-size: .85rem; color: var(--muted); margin-top: .5rem; }
dd { margin: 0 0 0 0; }
table { width: 100%; border-collapse: collapse; font-size: .9rem; }
th, td { text-align: left; padding: .4rem .5rem; border-bottom: 1px solid var(--card-border); }
th { font-size: .8rem; color: var(--muted); text-transform: uppercase; }
.stage-bar { display: flex; gap: 2px; margin: .75rem 0; border-radius: 4px; overflow: hidden; }
.stage-segment { flex: 1; height: 8px; background: #e9ecef; transition: background .2s; }
.stage-segment.completed { background: var(--success); }
.stage-segment.failed { background: var(--danger); }
.stage-segment.blocked { background: var(--critical); }
.stage-list { list-style: none; padding: 0; margin: .5rem 0; }
.stage-list li { padding: .3rem 0; font-size: .9rem; display: flex; align-items: center; gap: .4rem; }
.stage-icon { width: 18px; text-align: center; font-size: .85rem; }
.stage-icon.done { color: var(--success); }
.stage-icon.pending { color: var(--muted); }
.stage-icon.fail { color: var(--danger); }
.step-grid { display: grid; gap: .5rem; }
.step-item { padding: .5rem .75rem; border: 1px solid var(--card-border); border-radius: 4px; font-size: .9rem; }
.step-item.step-approval { border-color: var(--approval-border); background: #fffbeb; }
.step-item.step-blocked { border-color: var(--blocked-border); background: #faf5ff; }
.step-item code { font-family: 'SF Mono', 'Consolas', monospace; font-size: .82rem; background: #f1f3f5; padding: .1rem .3rem; border-radius: 2px; }
ul.plain { list-style: disc; padding-left: 1.25rem; margin: .25rem 0; font-size: .9rem; }
.error-box { background: #f8d7da; border: 1px solid #f5c2c7; border-radius: 4px; padding: .75rem 1rem; color: #842029; font-size: .9rem; margin-bottom: .75rem; }
.error-box .error-title { font-weight: 700; margin-bottom: .25rem; }
.error-box .error-hint { font-style: italic; color: #6b2129; font-size: .82rem; margin-top: .35rem; }
.warning-box { background: #fff3cd; border: 1px solid #ffecb5; border-radius: 4px; padding: .75rem 1rem; color: #664d03; font-size: .9rem; margin-bottom: .75rem; }
.blocked-box { background: var(--blocked-bg); border: 1px solid var(--blocked-border); border-radius: 4px; padding: .75rem 1rem; color: var(--blocked-fg); font-size: .9rem; margin-bottom: .75rem; }
.blocked-box .blocked-title { font-weight: 700; margin-bottom: .25rem; font-size: 1rem; }
.next-action { background: #e8f4fd; border: 1px solid #b6d4fe; border-radius: 4px; padding: .6rem 1rem; font-size: .85rem; color: #084298; margin-top: .5rem; }
.next-action strong { font-weight: 700; }
#mode-nav { padding: .5rem 1.5rem; border-bottom: 1px solid var(--card-border); background: var(--card-bg); display: flex; align-items: center; gap: .75rem; }
#mode-nav label { font-weight: 600; }
#mode-nav select { padding: .35rem .5rem; border-radius: 4px; border: 1px solid var(--card-border); }
.mode-hint { color: var(--muted); font-size: .82rem; font-style: italic; }
.real-form { padding: .75rem 1.5rem; border-bottom: 1px solid var(--card-border); background: var(--card-bg); }
.form-group { border: 1px solid var(--card-border); border-radius: 6px; padding: .75rem 1rem; margin-bottom: .75rem; }
.form-group legend { font-weight: 600; font-size: .9rem; padding: 0 .35rem; color: var(--muted); }
.form-row { display: flex; align-items: flex-start; gap: .75rem; margin-bottom: .6rem; flex-wrap: wrap; }
.form-row label { font-weight: 600; font-size: .9rem; min-width: 160px; padding-top: .35rem; }
.form-row input[type="text"] { flex: 1; min-width: 200px; padding: .4rem .5rem; border-radius: 4px; border: 1px solid var(--card-border); font-size: .9rem; }
.form-row input[type="text"]:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px rgba(13,110,253,.15); }
.form-row input.input-error { border-color: var(--danger); }
.form-row select { padding: .35rem .5rem; border-radius: 4px; border: 1px solid var(--card-border); }
.field-hint { display: block; width: 100%; font-size: .78rem; color: var(--muted); margin-top: -.2rem; padding-left: 160px; }
.field-hint code { font-size: .75rem; background: #f1f3f5; padding: .05rem .25rem; border-radius: 2px; }
.form-actions { display: flex; gap: .5rem; margin-top: .5rem; flex-wrap: wrap; }
.form-actions button { padding: .45rem 1.1rem; border-radius: 4px; border: 1px solid var(--accent); background: var(--accent); color: #fff; font-weight: 600; cursor: pointer; font-size: .9rem; }
.form-actions button:hover { opacity: .9; }
.form-actions button:disabled { opacity: .5; cursor: not-allowed; }
.form-actions .btn-secondary { background: var(--card-bg); color: var(--fg); border-color: var(--card-border); }
#validation-result { margin-top: .5rem; padding: .5rem .75rem; border-radius: 4px; font-size: .85rem; }
#validation-result.vr-ok { background: #d1e7dd; color: #0f5132; }
#validation-result.vr-err { background: #f8d7da; color: #842029; }
#validation-result.vr-mix { background: #fff3cd; color: #664d03; }
.collapsible { cursor: pointer; user-select: none; }
.collapsible::before { content: '\\25b6 '; font-size: .7rem; display: inline-block; transition: transform .15s; }
.collapsible.open::before { transform: rotate(90deg); }
.collapsible-body { display: none; margin-top: .25rem; }
.collapsible.open + .collapsible-body { display: block; }
.copy-btn { display: inline-block; padding: .15rem .5rem; border: 1px solid var(--card-border); border-radius: 3px; font-size: .72rem; background: var(--card-bg); cursor: pointer; color: var(--muted); margin-left: .5rem; }
.copy-btn:hover { background: #e9ecef; }
.progress-label { font-size: .82rem; color: var(--muted); margin-bottom: .25rem; }
.host-source-badge { display: inline-block; padding: .2rem .6rem; border-radius: 3px; font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .02em; margin-right: .4rem; }
.host-source-demo { background: #cff4fc; color: #055160; }
.host-source-file { background: #d1e7dd; color: #0f5132; }
.host-source-detected { background: #e2d9f3; color: #432874; }
#host-source-indicator { margin-top: .5rem; padding: .4rem .6rem; border-radius: 4px; font-size: .85rem; }
#detect-result { margin-top: .5rem; padding: .5rem .75rem; border-radius: 4px; font-size: .85rem; }
#detect-result.dr-ok { background: #d1e7dd; color: #0f5132; }
#detect-result.dr-err { background: #f8d7da; color: #842029; }
#detect-result.dr-loading { background: #fff3cd; color: #664d03; }
.section-nav { position: sticky; top: 0; z-index: 10; background: var(--card-bg); border-bottom: 1px solid var(--card-border); padding: .4rem 1.5rem; display: flex; gap: 1rem; font-size: .82rem; }
.section-nav a { color: var(--muted); text-decoration: none; padding: .2rem .4rem; border-radius: 3px; white-space: nowrap; }
.section-nav a:hover, .section-nav a.active { color: var(--accent); background: #e8f0fe; }
.run-context { background: #f0f4f8; border: 1px solid var(--card-border); border-radius: var(--card-radius); padding: .5rem 1rem; margin-bottom: 1rem; font-size: .82rem; display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
.run-context .run-label { font-weight: 600; }
.run-context .run-meta { color: var(--muted); }
.summary-strip { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--card-radius); padding: .6rem 1rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; font-size: .9rem; }
.summary-strip .ss-status { font-weight: 700; }
.summary-strip .ss-item { color: var(--muted); }
.export-bar { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; margin-top: .5rem; }
.export-bar button, .export-bar label { padding: .2rem .6rem; border: 1px solid var(--card-border); border-radius: 3px; font-size: .75rem; background: var(--card-bg); cursor: pointer; color: var(--muted); }
.export-bar button:hover, .export-bar label:hover { background: #e9ecef; }
.export-bar input[type="file"] { display: none; }
.recovery-hint { background: #e8f4fd; border: 1px solid #b6d4fe; border-radius: 4px; padding: .5rem .75rem; font-size: .82rem; color: #084298; margin-top: .5rem; }
.recovery-hint code { background: #d4e5f7; padding: .05rem .3rem; border-radius: 2px; font-size: .78rem; }
.timeline-panel { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--card-radius); padding: 1rem 1.25rem; margin-bottom: 1rem; }
.timeline-panel h2 { margin: 0 0 .75rem; font-size: 1.1rem; }
.timeline-list { list-style: none; padding: 0; margin: 0; position: relative; }
.timeline-list::before { content: ''; position: absolute; left: 10px; top: 8px; bottom: 8px; width: 2px; background: var(--card-border); }
.timeline-item { position: relative; padding: 0.4rem 0 0.4rem 2rem; font-size: .85rem; }
.timeline-dot { position: absolute; left: 5px; top: 0.55rem; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--card-border); background: var(--card-bg); z-index: 1; }
.timeline-item.tl-info .timeline-dot { border-color: var(--info); background: #e0f7fa; }
.timeline-item.tl-progress .timeline-dot { border-color: var(--success); background: #d1e7dd; }
.timeline-item.tl-warning .timeline-dot { border-color: var(--warning); background: #fff3cd; }
.timeline-item.tl-blocked .timeline-dot { border-color: var(--critical); background: #e2d9f3; }
.timeline-item.tl-failure .timeline-dot { border-color: var(--danger); background: #f8d7da; }
.timeline-time { color: var(--muted); font-size: .75rem; margin-right: .5rem; }
.timeline-kind { font-weight: 600; font-size: .78rem; margin-right: .35rem; }
.timeline-msg { color: var(--fg); }
.session-summary { background: #f0f4f8; border: 1px solid var(--card-border); border-radius: var(--card-radius); padding: 0.75rem 1rem; margin-bottom: 1rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: .5rem .75rem; font-size: .85rem; }
.session-summary .ss-label { font-weight: 600; color: var(--muted); font-size: .78rem; text-transform: uppercase; }
.session-summary .ss-value { margin-top: .1rem; }
.session-summary .ss-status-active { color: var(--accent); font-weight: 700; }
.session-summary .ss-status-completed { color: var(--success); font-weight: 700; }
.session-summary .ss-status-completed_requires_approval { color: var(--warning); font-weight: 700; }
.session-summary .ss-status-failed { color: var(--danger); font-weight: 700; }
.session-summary .ss-status-blocked { color: var(--critical); font-weight: 700; }
.session-summary .ss-status-idle { color: var(--muted); font-weight: 700; }
.timeline-toggle { cursor: pointer; background: none; border: 1px solid var(--card-border); border-radius: 4px; padding: .25rem .75rem; font-size: .82rem; color: var(--muted); margin-left: .5rem; }
.timeline-toggle:hover { background: #e9ecef; }
/* Phase 24: Console styles */
.console-status-header { position: sticky; top: 0; z-index: 9; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--card-radius); padding: .5rem 1rem; margin-bottom: .75rem; display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; font-size: .85rem; }
.console-status-header .csh-stage { font-weight: 700; }
.console-status-header .csh-status { font-weight: 700; padding: .15rem .5rem; border-radius: 3px; font-size: .78rem; text-transform: uppercase; }
.console-status-header .csh-status-active { background: #cff4fc; color: #055160; }
.console-status-header .csh-status-completed { background: #d1e7dd; color: #0f5132; }
.console-status-header .csh-status-completed_requires_approval { background: #fff3cd; color: #664d03; }
.console-status-header .csh-status-blocked { background: #e2d9f3; color: #432874; }
.console-status-header .csh-status-failed { background: #f8d7da; color: #842029; }
.console-status-header .csh-status-idle { background: #e9ecef; color: var(--muted); }
.console-status-header .csh-action { color: var(--muted); font-size: .78rem; margin-left: auto; }
.console-presence-bar { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--card-radius); padding: .5rem 1rem; margin-bottom: .75rem; display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; font-size: .82rem; }
.console-presence-bar .cpb-group { display: flex; align-items: center; gap: .35rem; }
.console-presence-bar .cpb-label { font-weight: 600; color: var(--muted); font-size: .75rem; text-transform: uppercase; }
.console-presence-bar .cpb-item { padding: .15rem .5rem; border-radius: 3px; font-size: .78rem; }
.cpb-ready { background: #d1e7dd; color: #0f5132; }
.cpb-pending { background: #fff3cd; color: #664d03; }
.console-filter-bar { padding: .4rem 0; margin-bottom: .5rem; display: flex; gap: .35rem; flex-wrap: wrap; }
.console-filter-bar button { padding: .25rem .7rem; border-radius: 4px; border: 1px solid var(--card-border); background: var(--card-bg); cursor: pointer; font-size: .78rem; color: var(--muted); transition: background .15s, color .15s; }
.console-filter-bar button:hover { background: #e9ecef; }
.console-filter-bar button.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.console-feed { list-style: none; padding: 0; margin: 0; }
.console-group { margin-bottom: .75rem; }
.console-group-header { display: flex; align-items: center; gap: .5rem; padding: .35rem .5rem; font-size: .78rem; color: var(--muted); border-bottom: 1px solid #eee; margin-bottom: .35rem; }
.console-group-header .cg-actor-icon { font-size: .9rem; }
.console-group-header .cg-actor-label { font-weight: 600; }
.console-group-header .cg-time { margin-left: auto; font-size: .72rem; }
.console-msg { padding: .35rem .75rem .35rem 2rem; font-size: .85rem; position: relative; }
.console-msg .cm-dot { position: absolute; left: .65rem; top: .55rem; width: 8px; height: 8px; border-radius: 50%; }
.console-msg .cm-kind { font-weight: 600; font-size: .78rem; margin-right: .35rem; }
.console-msg .cm-text { color: var(--fg); }
.console-msg .cm-detail-toggle { cursor: pointer; color: var(--accent); font-size: .75rem; margin-left: .5rem; text-decoration: underline; }
.console-msg .cm-detail { display: none; margin-top: .25rem; padding: .35rem .5rem; background: #f8f9fa; border-radius: 3px; font-size: .78rem; font-family: monospace; white-space: pre-wrap; max-height: 200px; overflow: auto; }
.console-msg .cm-detail.open { display: block; }
.console-card-approval { background: var(--approval-bg); border: 1px solid var(--approval-border); border-radius: var(--card-radius); padding: .75rem 1rem; margin: .5rem 0; }
.console-card-approval .cc-title { font-weight: 700; color: var(--approval-fg); margin-bottom: .25rem; }
.console-card-approval .cc-body { font-size: .85rem; color: var(--approval-fg); }
.console-card-blocked { background: var(--blocked-bg); border: 1px solid var(--blocked-border); border-radius: var(--card-radius); padding: .75rem 1rem; margin: .5rem 0; }
.console-card-blocked .cc-title { font-weight: 700; color: var(--blocked-fg); margin-bottom: .25rem; }
.console-card-blocked .cc-body { font-size: .85rem; color: var(--blocked-fg); }
.console-card-failure { background: #fef2f2; border: 1px solid #fca5a5; border-radius: var(--card-radius); padding: .75rem 1rem; margin: .5rem 0; }
.console-card-failure .cc-title { font-weight: 700; color: #842029; margin-bottom: .25rem; }
.console-card-failure .cc-body { font-size: .85rem; color: #842029; }
.console-card-success { background: #d1e7dd; border: 1px solid #a3cfbb; border-radius: var(--card-radius); padding: .75rem 1rem; margin: .5rem 0; }
.console-card-success .cc-title { font-weight: 700; color: #0f5132; margin-bottom: .25rem; }
.console-card-success .cc-body { font-size: .85rem; color: #0f5132; }
.console-card-lifecycle { background: #e8f4fd; border: 1px solid #b6d4fe; border-radius: var(--card-radius); padding: .5rem .75rem; margin: .35rem 0; font-size: .85rem; }
.console-card-lifecycle .cc-title { font-weight: 600; color: #084298; }
.console-card-discovery { background: #f0f4f8; border: 1px solid var(--card-border); border-radius: var(--card-radius); padding: .5rem .75rem; margin: .35rem 0; font-size: .85rem; }
.console-card-discovery .cc-title { font-weight: 600; color: var(--muted); }
.actor-system .cm-dot { background: var(--muted); }
.actor-workspace .cm-dot { background: var(--accent); }
.actor-mcp .cm-dot { background: var(--critical); }
.actor-agent .cm-dot { background: var(--success); }
.actor-workflow .cm-dot { background: var(--info); }
.console-panel { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--card-radius); padding: 1rem 1.25rem; margin-bottom: 1rem; }
.console-panel h2 { margin: 0 0 .75rem; font-size: 1.1rem; display: flex; align-items: center; gap: .5rem; }
.console-panel .console-toggle { cursor: pointer; background: none; border: 1px solid var(--card-border); border-radius: 4px; padding: .25rem .75rem; font-size: .82rem; color: var(--muted); margin-left: auto; }
.console-panel .console-toggle:hover { background: #e9ecef; }
.console-nav-link { color: var(--accent); font-size: .78rem; cursor: pointer; text-decoration: underline; margin-left: .5rem; }
/* Phase 28: Command Composer styles */
.command-composer { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--card-radius); padding: 1rem 1.25rem; margin-bottom: 1rem; }
.command-composer-title { margin: 0 0 .75rem; font-size: 1.1rem; }
.command-composer-bar { display: flex; gap: .5rem; align-items: center; margin-bottom: .75rem; }
.command-select { flex: 1; padding: .45rem .75rem; border: 1px solid var(--card-border); border-radius: 4px; font-size: .9rem; background: #fff; }
.command-submit-btn { min-width: 70px; }
.command-submit-btn:disabled { opacity: .5; cursor: not-allowed; }
.command-description { font-size: .85rem; color: var(--muted); margin-bottom: .5rem; min-height: 1.2em; }
.command-fields { display: flex; flex-direction: column; gap: .5rem; margin-bottom: .5rem; }
.command-fields label { font-size: .85rem; font-weight: 600; display: flex; flex-direction: column; gap: .2rem; }
.command-fields input, .command-fields select { padding: .4rem .65rem; border: 1px solid var(--card-border); border-radius: 4px; font-size: .88rem; }
.command-fields input.field-error { border-color: #dc3545; }
.command-validation { padding: .5rem .75rem; border-radius: 4px; font-size: .85rem; margin-bottom: .5rem; }
.command-validation.validation-error { background: #fff5f5; border: 1px solid #f5c6cb; color: #721c24; }
.command-validation.validation-ok { background: #f0fff4; border: 1px solid #c3e6cb; color: #155724; }
.command-result { padding: .5rem .75rem; border-radius: 4px; font-size: .85rem; margin-bottom: .5rem; }
.command-result.result-completed { background: #f0fff4; border: 1px solid #c3e6cb; color: #155724; }
.command-result.result-failed { background: #fff5f5; border: 1px solid #f5c6cb; color: #721c24; }
.command-result.result-validation_failed { background: #fffbeb; border: 1px solid #ffeeba; color: #856404; }
/* Phase 47: Adapter status bar */
.adapter-status-bar { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--card-radius); padding: .5rem 1rem; margin-bottom: .75rem; font-size: .82rem; display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
.adapter-status-bar .asb-label { font-weight: 600; color: var(--muted); font-size: .75rem; text-transform: uppercase; }
.adapter-status-bar .asb-kind { font-weight: 600; }
.adapter-status-bar .asb-badge { padding: .15rem .5rem; border-radius: 3px; font-size: .75rem; font-weight: 600; }
.asb-badge-model { background: #d1e7dd; color: #0f5132; }
.asb-badge-stub { background: #fff3cd; color: #664d03; }
.asb-badge-echo { background: #e8f4fd; color: #084298; }
.asb-badge-available { background: #d1e7dd; color: #0f5132; }
.asb-badge-unavailable { background: #f8d7da; color: #842029; }
.asb-badge-not-configured { background: #e9ecef; color: var(--muted); }
.asb-model-name { font-size: .78rem; color: var(--fg); font-family: monospace; }
/* Phase 47: Agent output card */
.agent-output-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--card-radius); padding: .75rem 1rem; margin: .5rem 0; }
.agent-output-card .aoc-header { display: flex; align-items: center; gap: .5rem; font-size: .78rem; color: var(--muted); margin-bottom: .35rem; flex-wrap: wrap; }
.agent-output-card .aoc-header .aoc-badge { padding: .1rem .4rem; border-radius: 3px; font-size: .72rem; font-weight: 600; }
.agent-output-card .aoc-body { font-size: .85rem; line-height: 1.5; white-space: pre-wrap; font-family: monospace; background: #f8f9fa; border-radius: 3px; padding: .5rem .75rem; max-height: 300px; overflow: auto; }
.agent-output-card .aoc-meta { font-size: .72rem; color: var(--muted); margin-top: .35rem; display: flex; gap: .75rem; flex-wrap: wrap; }
`;

// ---------------------------------------------------------------------------
// Client-side JavaScript
// ---------------------------------------------------------------------------

const CLIENT_JS = `
(function() {
  var $modeSelect = document.getElementById('mode-select');
  var $modeHint = document.getElementById('mode-hint');
  var $demoControls = document.getElementById('demo-controls');
  var $realControls = document.getElementById('real-controls');
  var $select = document.getElementById('scenario-select');
  var $desc = document.getElementById('scenario-desc');
  var $app = document.getElementById('app');
  var $dataDirInput = document.getElementById('data-dir-input');
  var $hostFileInput = document.getElementById('host-file-input');
  var $artifactInput = document.getElementById('artifact-input');
  var $stopAfterInput = document.getElementById('stop-after-input');
  var $runBtn = document.getElementById('run-workflow-btn');
  var $validateBtn = document.getElementById('validate-btn');
  var $resetBtn = document.getElementById('reset-form-btn');
  var $validationResult = document.getElementById('validation-result');
  var $detectHostBtn = document.getElementById('detect-host-btn');
  var $detectResult = document.getElementById('detect-result');
  var $hostSourceIndicator = document.getElementById('host-source-indicator');
  var $sectionNav = document.getElementById('section-nav');
  var $clearResultsBtn = document.getElementById('clear-results-btn');
  var $importHostFile = document.getElementById('import-host-file');
  var $importHostStatus = document.getElementById('import-host-status');

  // Current detected host profile (if any)
  var _detectedHostProfile = null;
  var _currentHostSource = null; // 'file' | 'detected' | null
  var _lastRunMeta = null;

  // ── Storage helpers ─────────────────────────────────────────────────

  var STORAGE_KEY = 'codingagent_shell_prefs';

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch(e) { return {}; }
  }

  function savePrefs(prefs) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch(e) {}
  }

  function restoreInputs() {
    var p = loadPrefs();
    if (p.mode) $modeSelect.value = p.mode;
    if (p.dataDir) $dataDirInput.value = p.dataDir;
    if (p.hostFile) $hostFileInput.value = p.hostFile;
    if (p.artifactId) $artifactInput.value = p.artifactId;
  }

  function persistInputs() {
    savePrefs({
      mode: $modeSelect.value,
      dataDir: $dataDirInput.value,
      hostFile: $hostFileInput.value,
      artifactId: $artifactInput.value,
    });
  }

  // ── Fetch helpers ───────────────────────────────────────────────────

  async function fetchJson(url) {
    var resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return resp.json();
  }

  async function postJson(url, body) {
    var resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return resp.json();
  }

  // ── Rendering helpers ───────────────────────────────────────────────

  function badge(severity) {
    return '<span class="badge badge-' + severity + '">' + severity + '</span>';
  }

  function esc(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function collapsible(title, bodyHtml, startOpen) {
    var cls = startOpen ? 'collapsible open' : 'collapsible';
    return '<span class="' + cls + '" onclick="this.classList.toggle(\\'open\\')">' + title + '</span>'
      + '<div class="collapsible-body">' + bodyHtml + '</div>';
  }

  function copyBtn(dataId) {
    return '<button class="copy-btn" data-copy="' + dataId + '" onclick="window.__copyData(this)" type="button">Copy JSON</button>';
  }

  // Global copy handler
  window.__copyData = function(btn) {
    var id = btn.getAttribute('data-copy');
    var el = document.getElementById(id);
    if (!el) return;
    try {
      navigator.clipboard.writeText(el.textContent);
      btn.textContent = 'Copied!';
      setTimeout(function() { btn.textContent = 'Copy JSON'; }, 1500);
    } catch(e) {}
  };

  // ── Status helpers ──────────────────────────────────────────────────

  // ── Section nav ──────────────────────────────────────────────────────

  function showSectionNav() {
    $sectionNav.innerHTML = [
      {id:'section-console',label:'Console'},
      {id:'section-host',label:'Host'},
      {id:'section-recommendation',label:'Recommendation'},
      {id:'section-compatibility',label:'Compatibility'},
      {id:'section-plan',label:'Plan Review'},
      {id:'section-workflow',label:'Workflow'},
      {id:'section-timeline',label:'Timeline'},
    ].map(function(s) {
      return '<a href="#' + s.id + '" data-section="' + s.id + '">' + s.label + '</a>';
    }).join('');
    $sectionNav.style.display = '';
    observeSections();
  }

  function hideSectionNav() {
    $sectionNav.style.display = 'none';
  }

  function observeSections() {
    if (!window.IntersectionObserver) return;
    var links = $sectionNav.querySelectorAll('a');
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          links.forEach(function(a) { a.classList.remove('active'); });
          var match = $sectionNav.querySelector('a[data-section="' + entry.target.id + '"]');
          if (match) match.classList.add('active');
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    ['section-host','section-recommendation','section-compatibility','section-plan','section-workflow'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }

  // ── Run context bar ─────────────────────────────────────────────────

  function renderRunContext(meta) {
    if (!meta) return '';
    var parts = ['<span class="run-label">' + esc(meta.mode === 'demo' ? 'Demo' : 'Real') + ' Run</span>'];
    if (meta.label) parts.push('<span class="run-meta">' + esc(meta.label) + '</span>');
    if (meta.timestamp) parts.push('<span class="run-meta">' + meta.timestamp + '</span>');
    if (meta.artifactId) parts.push('<span class="run-meta">Artifact: ' + esc(meta.artifactId) + '</span>');
    if (meta.stopAfter) parts.push('<span class="run-meta">Stopped after: ' + esc(meta.stopAfter) + '</span>');
    return '<div class="run-context">' + parts.join(' \\u00b7 ') + '</div>';
  }

  // ── Summary strip ───────────────────────────────────────────────────

  function renderSummaryStrip(data) {
    var sc = data.workflow ? getStatusConfig(data.workflow.status) : null;
    var parts = [];
    if (sc) parts.push('<span class="ss-status">' + sc.icon + ' ' + esc(data.workflow.statusLabel) + '</span>');
    if (data.host) parts.push('<span class="ss-item">' + esc(data.host.summary) + '</span>');
    if (data.recommendation) parts.push('<span class="ss-item">' + esc(data.recommendation.displayName) + '</span>');
    if (data.compatibility) parts.push('<span class="ss-item">' + esc(data.compatibility.label) + '</span>');
    return '<div class="summary-strip">' + parts.join(' \\u00b7 ') + '</div>';
  }

  // ── Export helpers ──────────────────────────────────────────────────

  function downloadJson(data, filename) {
    var blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function renderExportBar(data) {
    return '<div class="export-bar">'
      + '<button type="button" onclick="window.__exportResult()">Export Result JSON</button>'
      + '<button type="button" onclick="window.__exportHost()">Export Host JSON</button>'
      + '<button type="button" onclick="window.__copyResultText()">Copy Summary Text</button>'
      + '</div>';
  }

  window.__exportResult = function() {
    if (_lastResult) downloadJson(_lastResult, 'workflow-result-' + new Date().toISOString().slice(0,19).replace(/:/g,'-') + '.json');
  };

  window.__exportHost = function() {
    if (_lastResult && _lastResult.host) downloadJson(_lastResult.host, 'host-profile-' + new Date().toISOString().slice(0,19).replace(/:/g,'-') + '.json');
  };

  window.__copyResultText = function() {
    if (!_lastResult) return;
    var text = [];
    if (_lastResult.host) text.push('Host: ' + _lastResult.host.summary);
    if (_lastResult.recommendation) text.push('Recommendation: ' + _lastResult.recommendation.displayName + ' (score: ' + _lastResult.recommendation.score + ')');
    if (_lastResult.compatibility) text.push('Compatibility: ' + _lastResult.compatibility.label + ' \\u2014 ' + _lastResult.compatibility.summaryMessage);
    if (_lastResult.workflow) text.push('Status: ' + _lastResult.workflow.statusLabel + ' \\u2014 ' + _lastResult.workflow.statusSummary);
    try { navigator.clipboard.writeText(text.join('\\n')); } catch(e) {}
  };

  // ── Recovery hints ─────────────────────────────────────────────────

  var RECOVERY_HINTS = {
    'does not exist': 'Ensure the path is correct and the file/directory exists. Use absolute paths for reliability.',
    'missing required subdirectories': 'The data directory must contain models/, runtimes/, and agent-tools/ subdirectories. Example: <code>./data</code>',
    'Invalid host file': 'The host file may be corrupted or in the wrong format. Regenerate it with: <code>npm run generate-host-profile &gt; host.json</code>, or use Detect Host instead.',
    'Host file does not exist': 'The host file may have been moved or deleted. Use Detect Host for quick results, or regenerate with: <code>npm run generate-host-profile &gt; host.json</code>',
    'not found in the catalog': 'Remove the artifact ID field to use auto-recommendation, or verify the artifact ID against the catalog.',
  };

  function getRecoveryHint(err) {
    var msg = (err.message || '') + ' ' + (err.details ? JSON.stringify(err.details) : '');
    for (var pattern in RECOVERY_HINTS) {
      if (msg.indexOf(pattern) !== -1) return RECOVERY_HINTS[pattern];
    }
    return null;
  }

  // ── Status config ──────────────────────────────────────────────────

  var STATUS_CONFIG = {
    completed: { icon: '\\u2705', cardClass: '', nextAction: 'All stages completed successfully. The install plan is approved and ready for review.' },
    completed_requires_approval: { icon: '\\u26a0\\ufe0f', cardClass: 'card-approval', nextAction: 'Review the install plan carefully. Some steps require your explicit approval before execution.' },
    blocked: { icon: '\\ud83d\\udeab', cardClass: 'card-blocked', nextAction: 'This workflow is blocked. The install plan contains unsafe operations that cannot proceed. Do NOT execute this plan.' },
    failed: { icon: '\\u274c', cardClass: 'card-error', nextAction: 'The workflow failed at one of its stages. Check the error details below and correct the issue.' },
    partial: { icon: '\\u23f8\\ufe0f', cardClass: '', nextAction: 'The workflow stopped early as requested. Only a subset of stages were executed.' },
  };

  function getStatusConfig(status) {
    return STATUS_CONFIG[status] || STATUS_CONFIG.failed;
  }

  // ── Host summary ──────────────────────────────────────────────────────

  function renderHost(h, source) {
    var sourceBadgeHtml = source ? ' ' + hostSourceBadge(source) : '';
    return '<div class="card" id="section-host"><h2>\\ud83d\\udcbb Host Summary' + sourceBadgeHtml + '</h2>'
      + '<p><strong>' + esc(h.summary) + '</strong></p>'
      + '<dl>'
      + '<dt>OS / Arch</dt><dd>' + esc(h.os) + ' ' + esc(h.arch) + '</dd>'
      + '<dt>CPU</dt><dd>' + esc(h.cpuModel) + (h.cpuCores ? ' (' + h.cpuCores + ' cores)' : '') + '</dd>'
      + '<dt>RAM</dt><dd>' + (h.totalRamGb != null ? h.totalRamGb + ' GB' : 'Unknown') + '</dd>'
      + '<dt>GPU</dt><dd>' + (h.gpuPresent ? esc(h.gpuModel) + (h.gpuVramGb != null ? ' (' + h.gpuVramGb + ' GB VRAM)' : '') : 'Not present') + '</dd>'
      + '<dt>Installed Runtimes</dt><dd>' + (h.installedRuntimes.length > 0 ? esc(h.installedRuntimes.join(', ')) : '<em>None</em>') + '</dd>'
      + (h.missingDependencies.length > 0 ? '<dt>Missing Dependencies</dt><dd>' + esc(h.missingDependencies.join(', ')) + '</dd>' : '')
      + '</dl></div>';
  }

  // ── Recommendations ───────────────────────────────────────────────────

  function renderRecommendation(r) {
    if (!r) return '<div class="card" id="section-recommendation"><h2>\\ud83c\\udfaf Recommendation</h2><p class="muted">No recommendation available for this scenario.</p></div>';
    return '<div class="card" id="section-recommendation"><h2>\\ud83c\\udfaf Recommendation</h2>'
      + '<p><strong>' + esc(r.displayName) + '</strong> ' + badge(r.compatibilitySeverity) + '</p>'
      + '<dl>'
      + '<dt>Score</dt><dd>' + r.score + '</dd>'
      + '<dt>Compatibility</dt><dd>' + esc(r.compatibilityLabel) + '</dd>'
      + '</dl>'
      + '<h3>Explanations</h3><ul class="plain">' + r.explanations.map(function(e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>'
      + (r.warnings.length > 0 ? '<h3>Warnings</h3><ul class="plain">' + r.warnings.map(function(w) { return '<li>\\u26a0 ' + esc(w) + '</li>'; }).join('') + '</ul>' : '')
      + '</div>';
  }

  // ── Compatibility ─────────────────────────────────────────────────────

  function renderCompatibility(c) {
    if (!c) return '<div class="card" id="section-compatibility"><h2>\\ud83d\\udd0d Compatibility</h2><p class="muted">Not evaluated in this scenario.</p></div>';
    return '<div class="card" id="section-compatibility"><h2>\\ud83d\\udd0d Compatibility Detail</h2>'
      + '<p>' + badge(c.severity) + ' <strong>' + esc(c.label) + '</strong></p>'
      + '<p>' + esc(c.summaryMessage) + '</p>'
      + '<dl>'
      + '<dt>GPU Offload</dt><dd>' + (c.gpuOffloadPossible ? 'Yes' + (c.estimatedGpuLayers != null ? ' (' + c.estimatedGpuLayers + ' layers)' : '') : 'No') + '</dd>'
      + '<dt>Disk Swap Required</dt><dd>' + (c.requiresDiskSwap ? 'Yes' : 'No') + '</dd>'
      + (c.effectiveContextWindow != null ? '<dt>Context Window</dt><dd>' + c.effectiveContextWindow + ' tokens</dd>' : '')
      + '</dl>'
      + (c.reasons.length > 0 ? '<h3>Reasons</h3><ul class="plain">' + c.reasons.map(function(r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' : '')
      + (c.warnings.length > 0 ? '<h3>Warnings</h3><ul class="plain">' + c.warnings.map(function(w) { return '<li>\\u26a0 ' + esc(w) + '</li>'; }).join('') + '</ul>' : '')
      + (c.settingsAdjustments.length > 0 ? '<h3>Settings Adjustments</h3><table><tr><th>Parameter</th><th>Suggested</th><th>Reason</th></tr>'
        + c.settingsAdjustments.map(function(a) { return '<tr><td>' + esc(a.parameter) + '</td><td>' + esc(a.suggestedValue) + '</td><td>' + esc(a.reason) + '</td></tr>'; }).join('')
        + '</table>' : '')
      + '</div>';
  }

  // ── Plan review ───────────────────────────────────────────────────────

  function renderPlan(p) {
    if (!p) return '<div class="card" id="section-plan"><h2>\\ud83d\\udccb Install Plan</h2><p class="muted">No plan generated in this scenario.</p></div>';
    var safetyCardClass = '';
    if (p.safety && p.safety.status === 'blocked') safetyCardClass = ' card-blocked';
    else if (p.safety && p.safety.status === 'requiresHumanApproval') safetyCardClass = ' card-approval';
    return '<div class="card' + safetyCardClass + '" id="section-plan"><h2>\\ud83d\\udccb Install Plan Review</h2>'
      + '<p><strong>' + esc(p.humanSummary) + '</strong></p>'
      + '<dl>'
      + '<dt>Artifact</dt><dd>' + esc(p.artifactId) + '</dd>'
      + '<dt>Runtime</dt><dd>' + esc(p.runtimeId) + '</dd>'
      + '<dt>Platform</dt><dd>' + esc(p.targetPlatform) + '</dd>'
      + '<dt>Resources</dt><dd>Disk: ' + p.resourceEstimate.diskSpaceGb + ' GB'
        + (p.resourceEstimate.estimatedDownloadGb != null ? ', Download: ~' + p.resourceEstimate.estimatedDownloadGb + ' GB' : '')
        + (p.resourceEstimate.peakRamGb != null ? ', Peak RAM: ' + p.resourceEstimate.peakRamGb + ' GB' : '')
        + '</dd>'
      + '</dl>'
      + '<h3>Steps</h3><div class="step-grid">'
      + p.steps.map(function(s) {
          var cls = 'step-item';
          if (s.riskSeverity === 'critical') cls += ' step-blocked';
          else if (s.requiresApproval) cls += ' step-approval';
          return '<div class="' + cls + '">'
            + '<strong>Step ' + s.order + '</strong> ' + badge(s.riskSeverity)
            + (s.requiresApproval ? ' <em>(requires approval)</em>' : '')
            + (s.reversible ? '' : ' <span class="muted">(irreversible)</span>')
            + '<br><code>' + esc(s.command) + '</code>'
            + '<br><span class="muted">' + esc(s.description) + '</span></div>';
        }).join('')
      + '</div>'
      + (p.prerequisites.length > 0 ? '<h3>Prerequisites</h3><ul class="plain">'
        + p.prerequisites.map(function(pr) { return '<li><strong>' + esc(pr.name) + '</strong>: ' + esc(pr.installHint) + '</li>'; }).join('') + '</ul>' : '')
      + (p.risks.length > 0 ? '<h3>Risks</h3><ul class="plain">' + p.risks.map(function(r) { return '<li>\\u26a0 ' + esc(r) + '</li>'; }).join('') + '</ul>' : '')
      + renderSafety(p.safety)
      + '</div>';
  }

  // ── Safety status ─────────────────────────────────────────────────────

  function renderSafety(s) {
    if (!s) return '';
    var out = '<h3>Safety Evaluation</h3>';

    if (s.status === 'blocked') {
      out += '<div class="blocked-box">'
        + '<div class="blocked-title">\\ud83d\\udeab BLOCKED — Unsafe Operations Detected</div>'
        + '<p>' + esc(s.summaryMessage) + '</p>'
        + '</div>';
      out += '<div class="recovery-hint">This plan is blocked due to safety concerns. The plan should <strong>NOT</strong> be executed. Review the violations below.</div>';
    } else if (s.status === 'requiresHumanApproval') {
      out += '<div class="warning-box">'
        + '<strong>\\u26a0\\ufe0f Requires Human Approval</strong><br>'
        + esc(s.summaryMessage)
        + '</div>';
    } else {
      out += '<p>' + badge(s.severity) + ' <strong>' + esc(s.label) + '</strong></p>'
        + '<p>' + esc(s.summaryMessage) + '</p>';
    }

    if (s.violations.length > 0) {
      out += '<table><tr><th>Step</th><th>Type</th><th>Description</th><th>Severity</th></tr>'
        + s.violations.map(function(v) { return '<tr><td>' + v.stepIndex + '</td><td>' + esc(v.type) + '</td><td>' + esc(v.description) + '</td><td>' + badge(v.severity) + '</td></tr>'; }).join('')
        + '</table>';
    }
    if (s.warnings.length > 0) {
      out += '<ul class="plain">' + s.warnings.map(function(w) { return '<li>\\u26a0 ' + esc(w) + '</li>'; }).join('') + '</ul>';
    }
    return out;
  }

  // ── Workflow summary ──────────────────────────────────────────────────

  function renderWorkflow(w) {
    var sc = getStatusConfig(w.status);
    var completedCount = w.stages.filter(function(s) { return s.completed; }).length;
    var totalCount = w.stages.length;
    var pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    var out = '<div class="card ' + sc.cardClass + '" id="section-workflow"><h2>\\ud83d\\udce6 Workflow Summary</h2>';

    // Status line with icon
    out += '<p>' + sc.icon + ' ' + badge(w.statusSeverity) + ' <strong>' + esc(w.statusLabel) + '</strong></p>';
    out += '<p>' + esc(w.statusSummary) + '</p>';

    // Next action hint
    out += '<div class="next-action"><strong>\\u27a1 What to do next:</strong> ' + sc.nextAction + '</div>';

    // Error detail
    if (w.error) {
      out += '<div class="error-box" style="margin-top:.75rem;">'
        + '<div class="error-title">Error at stage: ' + esc(w.failedStage || 'unknown') + '</div>'
        + esc(w.error)
        + '</div>';
    }

    // Stopped-after hint
    if (w.stoppedAfter) {
      out += '<p class="muted" style="margin-top:.5rem;">\\u23f8 Stopped after: <strong>' + esc(w.stoppedAfter) + '</strong></p>';
      out += '<div class="recovery-hint">The workflow was stopped early. This is expected when using \\u201cStop After\\u201d. To run all stages, clear the \\u201cStop After\\u201d field.</div>';
    }

    // Progress bar
    out += '<div class="progress-label">Stage progress: ' + completedCount + '/' + totalCount + ' (' + pct + '%)</div>';
    out += '<div class="stage-bar">';
    out += w.stages.map(function(s) {
      var cls = 'stage-segment';
      if (s.completed) cls += ' completed';
      if (w.failedStage === s.stage) cls += ' failed';
      if (w.status === 'blocked' && !s.completed) cls += ' blocked';
      return '<div class="' + cls + '" title="' + esc(s.label) + '"></div>';
    }).join('');
    out += '</div>';

    // Stage list
    out += '<h3>Stages</h3><ul class="stage-list">';
    out += w.stages.map(function(s) {
      var iconClass = s.completed ? 'done' : 'pending';
      var icon = s.completed ? '\\u2713' : '\\u25cb';
      if (w.failedStage === s.stage) { iconClass = 'fail'; icon = '\\u2717'; }
      return '<li><span class="stage-icon ' + iconClass + '">' + icon + '</span> ' + esc(s.label)
        + (w.failedStage === s.stage ? ' <span class="badge badge-error">FAILED</span>' : '')
        + '</li>';
    }).join('');
    out += '</ul>';

    out += '</div>';
    return out;
  }

  // ── Full render ───────────────────────────────────────────────────────

  var _lastResult = null;

  function renderScenario(data) {
    _lastResult = data;
    showSectionNav();
    return renderRunContext(_lastRunMeta)
      + renderSummaryStrip(data)
      + renderHost(data.host, data.hostSource)
      + renderRecommendation(data.recommendation)
      + renderCompatibility(data.compatibility)
      + renderPlan(data.planReview)
      + renderWorkflow(data.workflow)
      + renderExportBar(data)
      + '<div style="text-align:right;margin-top:.5rem;">'
      + '<pre id="json-result" style="display:none">' + esc(JSON.stringify(data, null, 2)) + '</pre>'
      + copyBtn('json-result')
      + '</div>';
  }

  // ── Error render (improved) ──────────────────────────────────────────

  var ERROR_HINTS = {
    INVALID_INPUT: 'Check your input paths and values. Ensure the data directory exists and the host file is valid JSON.',
    MISSING_ARTIFACT: 'The specified artifact was not found in the catalog. Remove the artifact ID to use auto-recommendation, or verify the ID.',
    MISSING_RUNTIME: 'A required runtime is not available. Check installed runtimes on the target host.',
    BLOCKED_BY_POLICY: 'The workflow was blocked by a safety policy violation. Review the install plan for dangerous operations.',
    INTERNAL_FAILURE: 'An unexpected internal error occurred. This may be a bug. Check the details below.',
  };

  function renderError(err) {
    var hint = ERROR_HINTS[err.code] || '';
    var recovery = getRecoveryHint(err);
    var out = '<div class="error-box">';
    out += '<div class="error-title">[' + esc(err.code) + '] ' + esc(err.message) + '</div>';
    if (hint) out += '<div class="error-hint">' + esc(hint) + '</div>';
    if (recovery) out += '<div class="recovery-hint">' + recovery + '</div>';
    if (err.details) {
      out += collapsible('Show details', '<pre style="font-size:.8rem;overflow:auto;max-height:200px;margin:.25rem 0;">' + esc(JSON.stringify(err.details, null, 2)) + '</pre>', false);
    }
    out += '</div>';
    return out;
  }

  // ── Inline validation error ──────────────────────────────────────────

  var VALIDATION_HINTS = {
    dataDir: 'The data directory must exist and contain models/, runtimes/, agent-tools/ subdirectories.',
    hostFile: 'The host file must be a valid JSON file conforming to the HostProfile schema.',
    stopAfter: 'Use one of the valid stage names shown in the dropdown.',
  };

  // ── Host source tracking ────────────────────────────────────────────

  var HOST_SOURCE_LABELS = {
    demo: '\\ud83c\\udfad Demo Scenario',
    file: '\\ud83d\\udcc1 Host File',
    detected: '\\ud83d\\udd0d Live Detected',
  };

  var HOST_SOURCE_CLASSES = {
    demo: 'host-source-demo',
    file: 'host-source-file',
    detected: 'host-source-detected',
  };

  function updateHostSourceIndicator(source, detail) {
    if (!source) {
      $hostSourceIndicator.style.display = 'none';
      return;
    }
    var label = HOST_SOURCE_LABELS[source] || source;
    var cls = HOST_SOURCE_CLASSES[source] || '';
    $hostSourceIndicator.style.display = '';
    $hostSourceIndicator.innerHTML = '<span class="host-source-badge ' + cls + '">' + esc(label) + '</span>'
      + (detail ? '<span class="muted">' + esc(detail) + '</span>' : '');
    _currentHostSource = source;
  }

  // ── Host source rendering in scenario ──────────────────────────────

  function hostSourceBadge(source) {
    if (!source) return '';
    var label = HOST_SOURCE_LABELS[source] || source;
    var cls = HOST_SOURCE_CLASSES[source] || '';
    return '<span class="host-source-badge ' + cls + '">' + esc(label) + '</span>';
  }

  // ── Host detection ─────────────────────────────────────────────────

  $detectHostBtn.addEventListener('click', async function() {
    $detectResult.style.display = '';
    $detectResult.className = 'dr-loading';
    $detectResult.innerHTML = '\\u23f3 Detecting host hardware\\u2026';
    $detectHostBtn.disabled = true;

    try {
      var result = await postJson('/api/host/detect', {});
      if (result.ok) {
        _detectedHostProfile = result.hostProfile;
        _currentHostSource = 'detected';
        updateHostSourceIndicator('detected', result.summary ? result.summary.summary : '');
        $detectResult.className = 'dr-ok';
        var s = result.summary;
        $detectResult.innerHTML = '\\u2714\\ufe0f Host detected successfully.'
          + '<dl style="margin:.25rem 0;font-size:.85rem;">'
          + '<dt>Summary</dt><dd>' + esc(s.summary) + '</dd>'
          + '<dt>OS / Arch</dt><dd>' + esc(s.os) + ' ' + esc(s.arch) + '</dd>'
          + '<dt>CPU</dt><dd>' + esc(s.cpuModel) + (s.cpuCores ? ' (' + s.cpuCores + ' cores)' : '') + '</dd>'
          + '<dt>RAM</dt><dd>' + (s.totalRamGb != null ? s.totalRamGb + ' GB' : 'Unknown') + '</dd>'
          + '<dt>GPU</dt><dd>' + (s.gpuPresent ? esc(s.gpuModel) + (s.gpuVramGb != null ? ' (' + s.gpuVramGb + ' GB VRAM)' : '') : 'Not present / Unknown') + '</dd>'
          + '</dl>'
          + '<p style="font-size:.82rem;color:#6b7280;">This detected profile will be used when you click Run Workflow (host file is not required).</p>';
        // Clear host file requirement hint
        $hostFileInput.classList.remove('input-error');
      } else {
        _detectedHostProfile = null;
        $detectResult.className = 'dr-err';
        $detectResult.innerHTML = '\\u274c ' + esc(result.error ? result.error.message : 'Detection failed');
        updateHostSourceIndicator(null);
      }
    } catch (e) {
      _detectedHostProfile = null;
      $detectResult.className = 'dr-err';
      $detectResult.innerHTML = '\\u274c Host detection request failed: ' + esc(e.message)
        + '<div style="font-size:.8rem;color:#6b7280;margin-top:.25rem;">Check that the server is running and try again.</div>';
      updateHostSourceIndicator(null);
    } finally {
      $detectHostBtn.disabled = false;
    }
  });

  // When user types in host file, switch source back to file
  $hostFileInput.addEventListener('input', function() {
    $hostFileInput.classList.remove('input-error');
    if ($hostFileInput.value.trim()) {
      _currentHostSource = 'file';
      updateHostSourceIndicator('file', $hostFileInput.value.trim());
    } else if (_detectedHostProfile) {
      _currentHostSource = 'detected';
      updateHostSourceIndicator('detected');
    } else {
      updateHostSourceIndicator(null);
    }
  });

  // ── Mode switching ────────────────────────────────────────────────────

  var MODE_HINTS = {
    demo: 'Explore pre-built scenarios \\u2014 no setup required.',
    real: 'Run the real backend workflow with your own data directory and host profile, or detect your host live.',
  };

  function switchMode() {
    var mode = $modeSelect.value;
    $demoControls.style.display = mode === 'demo' ? '' : 'none';
    $realControls.style.display = mode === 'real' ? '' : 'none';
    $modeHint.textContent = MODE_HINTS[mode] || '';
    $app.innerHTML = mode === 'demo'
      ? '<p class="muted">Select a scenario above to begin.</p>'
      : '<p class="muted">Configure inputs and click Run Workflow.</p>';
    $validationResult.style.display = 'none';
    $detectResult.style.display = 'none';
    hideSectionNav();
    clearTimeline();
    if (mode === 'demo') {
      $hostSourceIndicator.style.display = 'none';
    }
    persistInputs();
  }

  $modeSelect.addEventListener('change', switchMode);

  // ── Demo mode: scenario selection ─────────────────────────────────────

  async function initDemo() {
    try {
      var scenarios = await fetchJson('/api/scenarios');
      $select.innerHTML = '<option value="">\\u2014 choose a scenario \\u2014</option>'
        + scenarios.map(function(s) {
            return '<option value="' + esc(s.id) + '">' + esc(s.label) + '</option>';
          }).join('');
    } catch (e) {
      $app.innerHTML = '<div class="error-box"><div class="error-title">Failed to load scenarios</div>' + esc(e.message) + '</div>';
    }
  }

  $select.addEventListener('change', async function() {
    var id = $select.value;
    $desc.textContent = '';
    if (!id) {
      $app.innerHTML = '<p class="muted">Select a scenario above to begin.</p>';
      return;
    }
    $app.innerHTML = '<p class="muted">Loading\\u2026</p>';
    try {
      var data = await fetchJson('/api/scenarios/' + encodeURIComponent(id));
      $desc.textContent = data.description;
      _lastRunMeta = { mode: 'demo', label: data.label || data.description, timestamp: new Date().toLocaleString() };
      $app.innerHTML = renderScenario(data);
      showDemoTimeline(data);
    } catch (e) {
      $app.innerHTML = '<div class="error-box"><div class="error-title">Failed to load scenario</div>' + esc(e.message) + '</div>';
    }
  });

  // ── Real mode: load stage names ───────────────────────────────────────

  async function initStages() {
    try {
      var stages = await fetchJson('/api/stages');
      $stopAfterInput.innerHTML = '<option value="">\\u2014 run all stages \\u2014</option>'
        + stages.map(function(s) {
            return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
          }).join('');
    } catch (e) {
      // fallback: leave as-is
    }
  }

  // ── Real mode: validate inputs ────────────────────────────────────────

  $validateBtn.addEventListener('click', async function() {
    var body = {};
    if ($dataDirInput.value.trim()) body.dataDir = $dataDirInput.value.trim();
    if ($hostFileInput.value.trim()) body.hostFile = $hostFileInput.value.trim();
    if ($stopAfterInput.value) body.stopAfter = $stopAfterInput.value;

    $validationResult.style.display = '';
    $validationResult.className = '';
    $validationResult.innerHTML = 'Validating\\u2026';

    try {
      var result = await postJson('/api/workflow/validate', body);
      var lines = [];
      var v = result.validations || {};
      var hasError = false;
      var hasValid = false;
      for (var k in v) {
        if (v[k].valid) {
          hasValid = true;
          lines.push('<div>\\u2714\\ufe0f <strong>' + esc(k) + '</strong>: valid</div>');
        } else {
          hasError = true;
          lines.push('<div>\\u274c <strong>' + esc(k) + '</strong>: ' + esc(v[k].error) + '</div>');
          if (VALIDATION_HINTS[k]) {
            lines.push('<div style="font-size:.8rem;color:#6b7280;margin-left:1.5rem;margin-bottom:.25rem;">' + esc(VALIDATION_HINTS[k]) + '</div>');
          }
        }
      }
      if (lines.length === 0) {
        $validationResult.innerHTML = 'No fields to validate. Enter a data directory and host file first.';
        $validationResult.className = 'vr-mix';
      } else {
        $validationResult.innerHTML = lines.join('');
        $validationResult.className = hasError ? (hasValid ? 'vr-mix' : 'vr-err') : 'vr-ok';
      }
    } catch (e) {
      $validationResult.innerHTML = 'Validation request failed: ' + esc(e.message);
      $validationResult.className = 'vr-err';
    }
  });

  // ── Real mode: run workflow ───────────────────────────────────────────

  $runBtn.addEventListener('click', async function() {
    var dataDir = $dataDirInput.value.trim();
    var hostFile = $hostFileInput.value.trim();
    var hasDetected = !!_detectedHostProfile;

    // Require dataDir always; require hostFile OR detected profile
    if (!dataDir || (!hostFile && !hasDetected)) {
      $app.innerHTML = '<div class="error-box">'
        + '<div class="error-title">Missing required fields</div>'
        + '<strong>Data Directory</strong> is required.'
        + (!hostFile && !hasDetected ? ' Provide a <strong>Host Profile File</strong> or use <strong>Detect Host</strong>.' : '')
        + '<div class="error-hint">Fill in the required inputs above and try again.</div>'
        + '</div>';
      if (!dataDir) $dataDirInput.classList.add('input-error');
      if (!hostFile && !hasDetected) $hostFileInput.classList.add('input-error');
      return;
    }
    $dataDirInput.classList.remove('input-error');
    $hostFileInput.classList.remove('input-error');

    var body = { dataDir: dataDir };
    // Prefer hostFile if provided; otherwise use detected profile
    if (hostFile) {
      body.hostFile = hostFile;
    } else if (hasDetected) {
      body.hostProfile = _detectedHostProfile;
    }
    if ($artifactInput.value.trim()) body.artifactId = $artifactInput.value.trim();
    if ($stopAfterInput.value) body.stopAfter = $stopAfterInput.value;

    persistInputs();
    $app.innerHTML = '<p class="muted">\\u23f3 Running workflow\\u2026</p>';
    $runBtn.disabled = true;
    $validateBtn.disabled = true;
    $validationResult.style.display = 'none';

    try {
      var result = await postJson('/api/workflow/run', body);
      if (result.ok) {
        _lastRunMeta = {
          mode: 'real',
          label: 'Real Workflow',
          timestamp: new Date().toLocaleString(),
          artifactId: $artifactInput.value.trim() || null,
          stopAfter: $stopAfterInput.value || null,
        };
        $app.innerHTML = renderScenario(result.viewModel);
        loadSessionTimeline(null);
      } else {
        hideSectionNav();
        $app.innerHTML = renderError(result.error);
      }
    } catch (e) {
      $app.innerHTML = '<div class="error-box"><div class="error-title">Workflow request failed</div>' + esc(e.message)
        + '<div class="error-hint">Check that the server is running and try again.</div></div>';
    } finally {
      $runBtn.disabled = false;
      $validateBtn.disabled = false;
    }
  });

  // ── Reset form ────────────────────────────────────────────────────────

  $resetBtn.addEventListener('click', function() {
    $dataDirInput.value = '';
    $hostFileInput.value = '';
    $artifactInput.value = '';
    $stopAfterInput.value = '';
    $dataDirInput.classList.remove('input-error');
    $hostFileInput.classList.remove('input-error');
    $validationResult.style.display = 'none';
    $detectResult.style.display = 'none';
    $hostSourceIndicator.style.display = 'none';
    _detectedHostProfile = null;
    _currentHostSource = null;
    _lastResult = null;
    _lastRunMeta = null;
    hideSectionNav();
    clearTimeline();
    $app.innerHTML = '<p class="muted">Configure inputs and click Run Workflow.</p>';
    savePrefs({ mode: 'real' });
  });

  // ── Input event listeners for error clearing ─────────────────────────

  $dataDirInput.addEventListener('input', function() { $dataDirInput.classList.remove('input-error'); });
  $hostFileInput.addEventListener('input', function() { $hostFileInput.classList.remove('input-error'); });

  // ── Clear results ───────────────────────────────────────────────────

  $clearResultsBtn.addEventListener('click', function() {
    $app.innerHTML = '<p class="muted">Configure inputs and click Run Workflow.</p>';
    hideSectionNav();
    clearTimeline();
    _lastResult = null;
    _lastRunMeta = null;
  });

  // ── Import host file ────────────────────────────────────────────────

  $importHostFile.addEventListener('change', function(evt) {
    var file = evt.target.files[0];
    if (!file) return;
    $importHostStatus.textContent = 'Reading\\u2026';
    var reader = new FileReader();
    reader.onload = async function(e) {
      try {
        var parsed = JSON.parse(e.target.result);
        var result = await postJson('/api/host/validate', parsed);
        if (result.valid) {
          _detectedHostProfile = result.hostProfile;
          _currentHostSource = 'file';
          updateHostSourceIndicator('file', result.summary ? result.summary.summary : '');
          $importHostStatus.textContent = '\\u2714 ' + file.name + ' loaded successfully';
          $importHostStatus.style.color = '#0f5132';
        } else {
          $importHostStatus.textContent = '\\u2718 Invalid: ' + (result.error || 'Unknown error');
          $importHostStatus.style.color = '#842029';
        }
      } catch (err) {
        $importHostStatus.textContent = '\\u2718 ' + err.message;
        $importHostStatus.style.color = '#842029';
      }
    };
    reader.readAsText(file);
  });

  // ── Session Timeline & Console ─────────────────────────────────────

  var $sessionSummary = document.getElementById('session-summary-container');
  var $sessionTimeline = document.getElementById('session-timeline-container');
  var $sessionConsole = document.getElementById('session-console-container');
  var $consoleStatusHeader = document.getElementById('console-status-header');
  var $consolePresenceBar = document.getElementById('console-presence-bar');
  var $consoleFilterBar = document.getElementById('console-filter-bar');
  var _currentSessionId = null;
  var _currentConsoleFilter = 'all';

  var EVENT_CATEGORIES = {
    session_created: 'info', note: 'info', info: 'info', catalogs_loaded: 'info',
    workspace_open_requested: 'info', clone_requested: 'info',
    mcp_tool_invocation_started: 'info',
    workspace_bound: 'progress', host_detected: 'progress', workflow_started: 'progress',
    stage_completed: 'progress', completed: 'progress',
    workspace_opened: 'progress', workspace_ready: 'progress',
    clone_started: 'progress', clone_completed: 'progress',
    mcp_attached: 'progress', mcp_started: 'progress',
    mcp_discovered_tools: 'progress', mcp_discovered_resources: 'progress', mcp_discovered_prompts: 'progress',
    agent_attached: 'progress', agent_enabled: 'progress', agent_capabilities_updated: 'progress',
    mcp_health_refreshed: 'progress', mcp_discovery_refreshed: 'progress',
    mcp_tool_invocation_completed: 'progress', mcp_github_attached: 'progress',
    mcp_tool_list_refreshed: 'progress',
    agent_selected_for_stage: 'progress',
    repo_fingerprinted: 'info', profile_selected: 'progress',
    agent_routing_evaluated: 'info', agent_stage_participation_updated: 'info',
    warning: 'warning', requires_approval: 'warning',
    mcp_attach_requested: 'warning', mcp_starting: 'warning',
    agent_attach_requested: 'warning',
    mcp_health_degraded: 'warning', mcp_stale: 'warning', agent_skipped_for_stage: 'warning',
    mcp_github_auth_missing: 'warning',
    agent_context_failed: 'warning',
    blocked: 'blocked',
    failed: 'failure', workspace_invalid: 'failure', clone_failed: 'failure',
    mcp_failed: 'failure', mcp_stopped: 'failure',
    mcp_tool_invocation_failed: 'failure',
    agent_failed: 'failure', agent_disabled: 'failure', agent_detached: 'failure',
    agent_context_assembled: 'progress', agent_context_refreshed: 'progress',
    agent_run_requested: 'info', agent_run_started: 'progress',
    agent_run_completed: 'progress', agent_run_failed: 'failure',
    agent_adapter_resolved: 'progress', agent_adapter_status_refreshed: 'info',
  };

  var CATEGORY_ICONS = {
    info: '\\u2139\\ufe0f', progress: '\\u2705', warning: '\\u26a0\\ufe0f', blocked: '\\ud83d\\udeab', failure: '\\u274c'
  };

  function classifyEventKind(kind) {
    return EVENT_CATEGORIES[kind] || 'info';
  }

  // ── Console actor/card classification (Phase 24) ──────────────────

  var KIND_TO_ACTOR = {
    session_created: 'system', note: 'system', info: 'system', warning: 'system',
    workspace_bound: 'workspace', workspace_open_requested: 'workspace', workspace_opened: 'workspace',
    workspace_invalid: 'workspace', workspace_ready: 'workspace',
    clone_requested: 'workspace', clone_started: 'workspace', clone_completed: 'workspace', clone_failed: 'workspace',
    mcp_attach_requested: 'mcp', mcp_attached: 'mcp', mcp_starting: 'mcp', mcp_started: 'mcp',
    mcp_failed: 'mcp', mcp_stopped: 'mcp',
    mcp_discovered_tools: 'mcp', mcp_discovered_resources: 'mcp', mcp_discovered_prompts: 'mcp',
    mcp_health_refreshed: 'mcp', mcp_health_degraded: 'mcp', mcp_discovery_refreshed: 'mcp', mcp_stale: 'mcp',
    mcp_tool_invocation_started: 'mcp', mcp_tool_invocation_completed: 'mcp', mcp_tool_invocation_failed: 'mcp',
    mcp_tool_list_refreshed: 'mcp', mcp_github_attached: 'mcp', mcp_github_auth_missing: 'mcp',
    agent_attach_requested: 'agent', agent_attached: 'agent', agent_detached: 'agent',
    agent_enabled: 'agent', agent_disabled: 'agent', agent_failed: 'agent', agent_capabilities_updated: 'agent',
    agent_routing_evaluated: 'agent', agent_stage_participation_updated: 'agent',
    agent_skipped_for_stage: 'agent', agent_selected_for_stage: 'agent',
    agent_context_assembled: 'agent', agent_context_refreshed: 'agent', agent_context_failed: 'agent',
    agent_run_requested: 'agent', agent_run_started: 'agent',
    agent_run_completed: 'agent', agent_run_failed: 'agent',
    agent_adapter_resolved: 'agent', agent_adapter_status_refreshed: 'agent',
    repo_fingerprinted: 'workspace', profile_selected: 'workspace',
    catalogs_loaded: 'workflow', host_detected: 'workflow', workflow_started: 'workflow',
    stage_completed: 'workflow', requires_approval: 'workflow', blocked: 'workflow',
    failed: 'workflow', completed: 'workflow',
  };

  var ACTOR_ICONS = {
    system: '\\u2699\\ufe0f', workspace: '\\ud83d\\udcc2', mcp: '\\ud83d\\udd0c',
    agent: '\\ud83e\\udd16', workflow: '\\ud83d\\udce6',
  };

  var ACTOR_LABELS = {
    system: 'System', workspace: 'Workspace', mcp: 'MCP Server',
    agent: 'Agent', workflow: 'Workflow',
  };

  var ACTOR_CSS = {
    system: 'actor-system', workspace: 'actor-workspace', mcp: 'actor-mcp',
    agent: 'actor-agent', workflow: 'actor-workflow',
  };

  var KIND_TO_CARD = {
    requires_approval: 'approval_card', blocked: 'blocked_card',
    failed: 'failure_card', workspace_invalid: 'failure_card', clone_failed: 'failure_card',
    mcp_failed: 'failure_card', agent_failed: 'failure_card',
    completed: 'success_card', clone_completed: 'success_card', workspace_ready: 'success_card',
    workspace_opened: 'lifecycle_card', mcp_attached: 'lifecycle_card', mcp_started: 'lifecycle_card',
    mcp_stopped: 'lifecycle_card', agent_attached: 'lifecycle_card', agent_enabled: 'lifecycle_card',
    agent_detached: 'lifecycle_card', agent_disabled: 'lifecycle_card',
    mcp_discovered_tools: 'discovery_card', mcp_discovered_resources: 'discovery_card',
    mcp_discovered_prompts: 'discovery_card', agent_capabilities_updated: 'discovery_card',
    mcp_health_refreshed: 'lifecycle_card', mcp_health_degraded: 'failure_card',
    mcp_discovery_refreshed: 'discovery_card', mcp_stale: 'lifecycle_card',
    mcp_tool_invocation_started: 'lifecycle_card', mcp_tool_invocation_completed: 'success_card',
    mcp_tool_invocation_failed: 'failure_card', mcp_tool_list_refreshed: 'discovery_card',
    mcp_github_attached: 'lifecycle_card', mcp_github_auth_missing: 'failure_card',
    agent_routing_evaluated: 'lifecycle_card', agent_stage_participation_updated: 'lifecycle_card',
    agent_skipped_for_stage: 'lifecycle_card', agent_selected_for_stage: 'lifecycle_card',
    repo_fingerprinted: 'discovery_card', profile_selected: 'discovery_card',
    agent_context_assembled: 'discovery_card', agent_context_refreshed: 'discovery_card',
    agent_context_failed: 'failure_card',
    agent_run_requested: 'lifecycle_card', agent_run_started: 'lifecycle_card',
    agent_run_completed: 'success_card', agent_run_failed: 'failure_card',
    agent_adapter_resolved: 'lifecycle_card', agent_adapter_status_refreshed: 'lifecycle_card',
  };

  var CARD_CSS = {
    message: 'console-msg', approval_card: 'console-card-approval', blocked_card: 'console-card-blocked',
    failure_card: 'console-card-failure', success_card: 'console-card-success',
    lifecycle_card: 'console-card-lifecycle', discovery_card: 'console-card-discovery',
  };

  var CARD_TITLES = {
    approval_card: '\\u26a0\\ufe0f Approval Required',
    blocked_card: '\\ud83d\\udeab Blocked',
    failure_card: '\\u274c Failure',
    success_card: '\\u2705 Success',
    lifecycle_card: '\\ud83d\\udd04 Lifecycle',
    discovery_card: '\\ud83d\\udd0d Discovery',
  };

  function classifyActor(kind) { return KIND_TO_ACTOR[kind] || 'system'; }
  function classifyCard(kind) { return KIND_TO_CARD[kind] || 'message'; }

  // ── Adapter status helpers (Phase 47) ─────────────────────────────

  var ADAPTER_KIND_LABELS = {
    stub: 'Stub (Demo)',
    openai_compatible: 'OpenAI-Compatible API',
    echo_test: 'Echo Test',
  };

  var ADAPTER_AVAILABILITY_LABELS = {
    configured_available: 'Available',
    configured_unavailable: 'Unavailable',
    not_configured: 'Not Configured',
    unsupported: 'Unsupported',
  };

  function adapterKindBadgeClass(kind) {
    if (kind === 'openai_compatible') return 'asb-badge asb-badge-model';
    if (kind === 'echo_test') return 'asb-badge asb-badge-echo';
    return 'asb-badge asb-badge-stub';
  }

  function adapterAvailBadgeClass(avail) {
    if (avail === 'configured_available') return 'asb-badge asb-badge-available';
    if (avail === 'configured_unavailable') return 'asb-badge asb-badge-unavailable';
    return 'asb-badge asb-badge-not-configured';
  }

  function adapterModelBackedLabel(isModelBacked, kind) {
    if (isModelBacked) return 'Model-Backed';
    if (kind === 'echo_test') return 'Echo Test (Not Model Output)';
    return 'Stub (Not Model Output)';
  }

  function renderAdapterStatusInline(status) {
    var html = '<div class="cpb-group"><span class="cpb-label">\\ud83e\\udde0 Adapter:</span>';
    var kindLabel = ADAPTER_KIND_LABELS[status.kind] || status.kind;
    html += '<span class="' + adapterKindBadgeClass(status.kind) + '">' + esc(kindLabel) + '</span>';
    var availLabel = ADAPTER_AVAILABILITY_LABELS[status.availability] || status.availability;
    html += '<span class="' + adapterAvailBadgeClass(status.availability) + '">' + esc(availLabel) + '</span>';
    if (status.isModelBacked !== null && status.isModelBacked !== undefined) {
      var mbLabel = adapterModelBackedLabel(status.isModelBacked, status.kind);
      var mbClass = status.isModelBacked ? 'asb-badge asb-badge-model' : 'asb-badge asb-badge-stub';
      html += '<span class="' + mbClass + '">' + esc(mbLabel) + '</span>';
    }
    if (status.modelName) {
      html += '<span class="asb-model-name">' + esc(status.modelName) + '</span>';
    }
    html += '</div>';
    return html;
  }

  function renderAgentOutputCard(msg) {
    var d = msg.detail || {};
    var isModel = d.isModelGenerated === true;
    var adapterKind = d.adapterKind || 'unknown';
    var kindLabel = ADAPTER_KIND_LABELS[adapterKind] || adapterKind;
    var outputPreview = d.outputPreview || '';
    var durationMs = d.durationMs;
    var agentName = d.agentName || 'agent';
    var taskKind = d.taskKind || '';

    // Header badges
    var html = '<div class="agent-output-card">';
    html += '<div class="aoc-header">';
    html += '<strong>' + esc(agentName) + '</strong>';
    if (taskKind) html += '<span style="color:var(--muted)">\\u2014 ' + esc(taskKind) + '</span>';
    // Model vs Stub badge
    if (isModel) {
      html += '<span class="aoc-badge asb-badge-model">Model Output</span>';
    } else if (adapterKind === 'echo_test') {
      html += '<span class="aoc-badge asb-badge-echo">Echo Test Output</span>';
    } else {
      html += '<span class="aoc-badge asb-badge-stub">Stub Output</span>';
    }
    html += '<span class="aoc-badge" style="background:#f0f4f8;color:var(--muted)">' + esc(kindLabel) + '</span>';
    html += '</div>';

    // Output body
    if (outputPreview) {
      html += '<div class="aoc-body">' + esc(outputPreview) + '</div>';
    }

    // Metadata row
    html += '<div class="aoc-meta">';
    if (msg.timestamp) html += '<span>\\ud83d\\udd52 ' + new Date(msg.timestamp).toLocaleTimeString() + '</span>';
    if (durationMs !== null && durationMs !== undefined) html += '<span>\\u23f1 ' + durationMs + 'ms</span>';
    if (d.runId) html += '<span>ID: ' + esc(String(d.runId).substring(0, 8)) + '</span>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function renderAgentErrorCard(msg) {
    var d = msg.detail || {};
    var errorCode = d.errorCode || 'UNKNOWN';
    var errorMessage = d.errorMessage || msg.message || 'Agent run failed';

    var html = '<div class="console-card-failure">';
    html += '<div class="cc-title">\\u274c Agent Run Failed</div>';
    html += '<div class="cc-body">';
    html += '<strong>' + esc(errorCode) + '</strong> \\u2014 ' + esc(errorMessage);
    html += '</div>';
    html += '<div class="aoc-meta">';
    if (msg.timestamp) html += '<span>\\ud83d\\udd52 ' + new Date(msg.timestamp).toLocaleTimeString() + '</span>';
    if (d.runId) html += '<span>ID: ' + esc(String(d.runId).substring(0, 8)) + '</span>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function renderAdapterResolvedCard(msg) {
    var d = msg.detail || {};
    var adapterKind = d.adapterKind || 'unknown';
    var kindLabel = ADAPTER_KIND_LABELS[adapterKind] || adapterKind;
    var isModel = d.isModelBacked === true;
    var avail = d.availability || 'not_configured';
    var availLabel = ADAPTER_AVAILABILITY_LABELS[avail] || avail;

    var html = '<div class="adapter-status-bar">';
    html += '<span class="asb-label">\\ud83e\\udde0 Adapter Resolved</span>';
    html += '<span class="' + adapterKindBadgeClass(adapterKind) + '">' + esc(kindLabel) + '</span>';
    html += '<span class="' + adapterAvailBadgeClass(avail) + '">' + esc(availLabel) + '</span>';
    if (isModel) {
      html += '<span class="asb-badge asb-badge-model">Model-Backed</span>';
    } else {
      html += '<span class="asb-badge asb-badge-stub">' + esc(adapterModelBackedLabel(false, adapterKind)) + '</span>';
    }
    if (d.modelName) html += '<span class="asb-model-name">' + esc(d.modelName) + '</span>';
    if (d.label) html += '<span style="font-size:.78rem;color:var(--muted)">' + esc(d.label) + '</span>';
    html += '</div>';
    return html;
  }

  // ── Console rendering (Phase 24) ──────────────────────────────────

  function renderConsoleStatusHeader(presence) {
    if (!presence) { $consoleStatusHeader.style.display = 'none'; return; }
    var statusCls = 'csh-status csh-status-' + (presence.sessionStatus || 'idle');
    var html = '<span class="csh-stage">' + esc(presence.sessionStage || 'initializing') + '</span>';
    html += '<span class="' + statusCls + '">' + esc(presence.sessionStatus || 'idle') + '</span>';
    if (presence.approvalRequired) html += '<span style="color:var(--warning);font-weight:700;">\\u26a0 Approval Required</span>';
    if (presence.isBlocked) html += '<span style="color:var(--danger);font-weight:700;">\\ud83d\\udeab Blocked</span>';
    if (presence.lastSignificantAction) html += '<span class="csh-action">' + esc(presence.lastSignificantAction) + '</span>';
    $consoleStatusHeader.innerHTML = html;
    $consoleStatusHeader.style.display = '';
  }

  function renderConsolePresenceBar(presence) {
    if (!presence) { $consolePresenceBar.style.display = 'none'; return; }
    var html = '';
    // Workspace
    html += '<div class="cpb-group"><span class="cpb-label">\\ud83d\\udcc2 Workspace:</span>';
    html += '<span class="cpb-item ' + (presence.workspaceStatus === 'ready' ? 'cpb-ready' : 'cpb-pending') + '">';
    html += esc(presence.workspaceStatus || 'none');
    if (presence.workspacePath) html += ' \\u2014 ' + esc(presence.workspacePath);
    html += '</span></div>';
    // MCP
    if (presence.mcpServers && presence.mcpServers.length > 0) {
      html += '<div class="cpb-group"><span class="cpb-label">\\ud83d\\udd0c MCP:</span>';
      for (var i = 0; i < presence.mcpServers.length; i++) {
        var s = presence.mcpServers[i];
        html += '<span class="cpb-item ' + (s.ready ? 'cpb-ready' : 'cpb-pending') + '">' + esc(s.label) + '</span>';
      }
      html += '</div>';
    }
    // Agents
    if (presence.agents && presence.agents.length > 0) {
      html += '<div class="cpb-group"><span class="cpb-label">\\ud83e\\udd16 Agents:</span>';
      for (var j = 0; j < presence.agents.length; j++) {
        var a = presence.agents[j];
        html += '<span class="cpb-item ' + (a.ready ? 'cpb-ready' : 'cpb-pending') + '">' + esc(a.label) + '</span>';
      }
      html += '</div>';
    }
    // Adapter status (Phase 47)
    if (presence.adapterStatus) {
      html += renderAdapterStatusInline(presence.adapterStatus);
    }
    $consolePresenceBar.innerHTML = html;
    $consolePresenceBar.style.display = '';
  }

  function renderConsoleFilterBar() {
    var filters = [
      { id: 'all', label: 'All', icon: '\\ud83d\\udcac' },
      { id: 'system', label: 'System', icon: '\\u2699\\ufe0f' },
      { id: 'workspace', label: 'Workspace', icon: '\\ud83d\\udcc2' },
      { id: 'mcp', label: 'MCP', icon: '\\ud83d\\udd0c' },
      { id: 'agent', label: 'Agent', icon: '\\ud83e\\udd16' },
      { id: 'workflow', label: 'Workflow', icon: '\\ud83d\\udce6' },
    ];
    var html = '';
    for (var i = 0; i < filters.length; i++) {
      var f = filters[i];
      var active = f.id === _currentConsoleFilter ? ' active' : '';
      html += '<button type="button" data-filter="' + f.id + '" class="' + active + '">' + f.icon + ' ' + esc(f.label) + '</button>';
    }
    $consoleFilterBar.innerHTML = html;
    $consoleFilterBar.style.display = '';
    // Attach click handlers
    var btns = $consoleFilterBar.querySelectorAll('button');
    btns.forEach(function(btn) {
      btn.onclick = function() {
        _currentConsoleFilter = btn.getAttribute('data-filter');
        btns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        rerenderConsoleMessages();
      };
    });
  }

  var _consoleMessages = [];
  var _consoleGroups = [];

  function rerenderConsoleMessages() {
    var filtered = _currentConsoleFilter === 'all' ? _consoleMessages : _consoleMessages.filter(function(m) { return m.actor === _currentConsoleFilter; });
    var groups = groupConsoleMessages(filtered);
    renderConsoleGroups(groups);
  }

  function groupConsoleMessages(messages) {
    if (messages.length === 0) return [];
    var groups = [];
    var current = { actor: messages[0].actor, startTime: messages[0].timestamp, messages: [messages[0]] };
    for (var i = 1; i < messages.length; i++) {
      var m = messages[i];
      var gap = new Date(m.timestamp).getTime() - new Date(current.startTime).getTime();
      if (m.actor === current.actor && gap <= 30000) {
        current.messages.push(m);
      } else {
        groups.push(current);
        current = { actor: m.actor, startTime: m.timestamp, messages: [m] };
      }
    }
    groups.push(current);
    return groups;
  }

  function renderConsoleGroups(groups) {
    if (groups.length === 0) {
      $sessionConsole.innerHTML = '';
      return;
    }
    var html = '<div class="console-panel" id="section-console">';
    html += '<h2>\\ud83d\\udcac Session Console <button class="console-toggle" id="console-toggle-btn" type="button">Hide</button></h2>';
    html += '<div id="console-feed-content"><ul class="console-feed">';
    for (var gi = 0; gi < groups.length; gi++) {
      var g = groups[gi];
      var actorIcon = ACTOR_ICONS[g.actor] || '\\u2699\\ufe0f';
      var actorLabel = ACTOR_LABELS[g.actor] || 'System';
      var actorCss = ACTOR_CSS[g.actor] || 'actor-system';
      var startTime = g.startTime ? new Date(g.startTime).toLocaleTimeString() : '';
      html += '<li class="console-group">';
      html += '<div class="console-group-header"><span class="cg-actor-icon">' + actorIcon + '</span>';
      html += '<span class="cg-actor-label">' + esc(actorLabel) + '</span>';
      html += '<span class="cg-time">' + esc(startTime) + '</span></div>';
      for (var mi = 0; mi < g.messages.length; mi++) {
        html += renderConsoleMessage(g.messages[mi], actorCss);
      }
      html += '</li>';
    }
    html += '</ul></div></div>';
    $sessionConsole.innerHTML = html;
    // Toggle handler
    var toggleBtn = document.getElementById('console-toggle-btn');
    var feedContent = document.getElementById('console-feed-content');
    if (toggleBtn && feedContent) {
      toggleBtn.onclick = function() {
        if (feedContent.style.display === 'none') {
          feedContent.style.display = '';
          toggleBtn.textContent = 'Hide';
        } else {
          feedContent.style.display = 'none';
          toggleBtn.textContent = 'Show';
        }
      };
    }
    // Detail toggle handlers
    var detailToggles = $sessionConsole.querySelectorAll('.cm-detail-toggle');
    detailToggles.forEach(function(toggle) {
      toggle.onclick = function() {
        var detail = toggle.parentElement.querySelector('.cm-detail');
        if (detail) {
          detail.classList.toggle('open');
          toggle.textContent = detail.classList.contains('open') ? 'hide detail' : 'show detail';
        }
      };
    });
  }

  function renderConsoleMessage(msg, actorCss) {
    var cardType = classifyCard(msg.kind);
    var cat = msg.category || classifyEventKind(msg.kind);
    var catIcon = CATEGORY_ICONS[cat] || '\\u2139\\ufe0f';
    var time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';

    // Phase 47: Specialized agent output/error/adapter cards
    if (msg.kind === 'agent_run_completed' && msg.detail) {
      return renderAgentOutputCard(msg);
    }
    if (msg.kind === 'agent_run_failed' && msg.detail) {
      return renderAgentErrorCard(msg);
    }
    if ((msg.kind === 'agent_adapter_resolved' || msg.kind === 'agent_adapter_status_refreshed') && msg.detail) {
      return renderAdapterResolvedCard(msg);
    }

    // Action-oriented cards for high-value states
    if (cardType !== 'message') {
      var cardCss = CARD_CSS[cardType] || 'console-msg';
      var cardTitle = CARD_TITLES[cardType] || '';
      var html = '<div class="' + cardCss + '">';
      if (cardTitle) html += '<div class="cc-title">' + cardTitle + '</div>';
      html += '<div class="cc-body">' + catIcon + ' <strong>' + esc(msg.kind) + '</strong> \\u2014 ' + esc(msg.message);
      // Navigation link for workflow cards
      if (msg.kind === 'completed' || msg.kind === 'requires_approval' || msg.kind === 'blocked' || msg.kind === 'failed') {
        html += '<a class="console-nav-link" href="#section-workflow" onclick="document.getElementById(\\'section-workflow\\')&&document.getElementById(\\'section-workflow\\').scrollIntoView({behavior:\\'smooth\\'})">View Workflow \\u2192</a>';
      }
      if (msg.kind === 'workspace_opened' || msg.kind === 'workspace_ready' || msg.kind === 'workspace_invalid' || msg.kind === 'clone_completed' || msg.kind === 'clone_failed') {
        html += '<a class="console-nav-link" href="#section-host" onclick="document.getElementById(\\'section-host\\')&&document.getElementById(\\'section-host\\').scrollIntoView({behavior:\\'smooth\\'})">View Host \\u2192</a>';
      }
      html += '</div>';
      if (msg.detail) {
        html += '<span class="cm-detail-toggle">show detail</span>';
        html += '<div class="cm-detail">' + esc(JSON.stringify(msg.detail, null, 2)) + '</div>';
      }
      html += '</div>';
      return html;
    }

    // Normal message
    var html = '<div class="console-msg ' + actorCss + '">';
    html += '<span class="cm-dot"></span>';
    html += '<span class="cm-kind">' + catIcon + ' ' + esc(msg.kind) + '</span>';
    html += '<span class="cm-text">' + esc(msg.message) + '</span>';
    if (msg.detail) {
      html += '<span class="cm-detail-toggle">show detail</span>';
      html += '<div class="cm-detail">' + esc(JSON.stringify(msg.detail, null, 2)) + '</div>';
    }
    html += '</div>';
    return html;
  }

  function enrichMessages(events) {
    return events.map(function(ev) {
      return {
        kind: ev.kind,
        timestamp: ev.timestamp,
        message: ev.message,
        category: ev.category || classifyEventKind(ev.kind),
        actor: classifyActor(ev.kind),
        cardType: classifyCard(ev.kind),
        detail: ev.detail || null,
      };
    });
  }

  function renderConsoleFull(messages, presence) {
    _consoleMessages = messages;
    renderConsoleStatusHeader(presence);
    renderConsolePresenceBar(presence);
    renderConsoleFilterBar();
    rerenderConsoleMessages();
  }

  function clearConsole() {
    $sessionConsole.innerHTML = '';
    $consoleStatusHeader.style.display = 'none';
    $consolePresenceBar.style.display = 'none';
    $consoleFilterBar.style.display = 'none';
    _consoleMessages = [];
    _consoleGroups = [];
    _currentConsoleFilter = 'all';
  }

  function renderSessionSummary(summary) {
    if (!summary) { $sessionSummary.innerHTML = ''; return; }
    var statusClass = 'ss-status-' + (summary.status || 'idle');
    var html = '<div class="session-summary">';
    html += '<div><div class="ss-label">Session ID</div><div class="ss-value" style="font-family:monospace;font-size:.78rem;">' + esc(summary.id || '\\u2014') + '</div></div>';
    html += '<div><div class="ss-label">Status</div><div class="ss-value ' + statusClass + '">' + esc(summary.status || 'idle') + '</div></div>';
    html += '<div><div class="ss-label">Stage</div><div class="ss-value">' + esc(summary.stage || '\\u2014') + '</div></div>';
    html += '<div><div class="ss-label">Workspace</div><div class="ss-value">' + esc(summary.workspaceStatus || 'none') + '</div></div>';
    if (summary.workspacePath) {
      html += '<div><div class="ss-label">Path</div><div class="ss-value" style="font-family:monospace;font-size:.78rem;word-break:break-all;">' + esc(summary.workspacePath) + '</div></div>';
    }
    if (summary.workspaceSource) {
      html += '<div><div class="ss-label">Source</div><div class="ss-value">' + esc(summary.workspaceSource) + '</div></div>';
    }
    if (summary.workspaceIsGitRepo != null) {
      html += '<div><div class="ss-label">Git Repo</div><div class="ss-value">' + (summary.workspaceIsGitRepo ? 'Yes' : 'No') + '</div></div>';
    }
    if (summary.workspaceRemoteUrl) {
      html += '<div><div class="ss-label">Remote</div><div class="ss-value" style="font-family:monospace;font-size:.78rem;word-break:break-all;">' + esc(summary.workspaceRemoteUrl) + '</div></div>';
    }
    if (summary.workspaceBranch) {
      html += '<div><div class="ss-label">Branch</div><div class="ss-value">' + esc(summary.workspaceBranch) + '</div></div>';
    }
    html += '<div><div class="ss-label">MCP Servers</div><div class="ss-value">' + (summary.mcpServerCount || 0) + ' attached</div></div>';
    html += '<div><div class="ss-label">Events</div><div class="ss-value">' + (summary.eventCount || 0) + ' total</div></div>';
    if (summary.approvalRequired) {
      html += '<div><div class="ss-label">Approval</div><div class="ss-value" style="color:var(--warning);font-weight:700;">Required</div></div>';
    }
    if (summary.isBlocked) {
      html += '<div><div class="ss-label">Blocked</div><div class="ss-value" style="color:var(--danger);font-weight:700;">Yes</div></div>';
    }
    if (summary.lastError) {
      html += '<div style="grid-column:1/-1;"><div class="ss-label">Last Error</div><div class="ss-value" style="color:var(--danger);">' + esc(summary.lastError) + '</div></div>';
    }
    // Fingerprint / language profile (Phase 38)
    if (summary.profileId) {
      html += '<div><div class="ss-label">Language Profile</div><div class="ss-value">' + esc(summary.profileLabel || summary.profileId) + '</div></div>';
    }
    if (summary.primaryLanguage) {
      html += '<div><div class="ss-label">Primary Language</div><div class="ss-value">' + esc(summary.primaryLanguage) + '</div></div>';
    }
    if (summary.detectedLanguages && summary.detectedLanguages.length > 0) {
      html += '<div><div class="ss-label">Detected Languages</div><div class="ss-value">' + esc(summary.detectedLanguages.join(', ')) + '</div></div>';
    }
    if (summary.detectedFrameworks && summary.detectedFrameworks.length > 0) {
      html += '<div><div class="ss-label">Frameworks</div><div class="ss-value">' + esc(summary.detectedFrameworks.join(', ')) + '</div></div>';
    }
    if (summary.isMixedRepo != null) {
      html += '<div><div class="ss-label">Mixed Repo</div><div class="ss-value">' + (summary.isMixedRepo ? 'Yes' : 'No') + '</div></div>';
    }
    if (summary.profileSelectionExplanation) {
      html += '<div style="grid-column:1/-1;"><div class="ss-label">Profile Reason</div><div class="ss-value" style="font-size:.78rem;">' + esc(summary.profileSelectionExplanation) + '</div></div>';
    }
    html += '</div>';
    $sessionSummary.innerHTML = html;
  }

  function renderTimeline(events, collapsed) {
    if (!events || events.length === 0) {
      $sessionTimeline.innerHTML = '';
      return;
    }
    var html = '<div class="timeline-panel" id="section-timeline">';
    html += '<h2>\\ud83d\\udccb Session Timeline <button class="timeline-toggle" id="timeline-toggle-btn" type="button">' + (collapsed ? 'Show' : 'Hide') + '</button></h2>';
    html += '<ul class="timeline-list" id="timeline-list" style="' + (collapsed ? 'display:none;' : '') + '">';
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var cat = ev.category || classifyEventKind(ev.kind);
      var icon = CATEGORY_ICONS[cat] || '\\u2139\\ufe0f';
      var time = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '';
      html += '<li class="timeline-item tl-' + cat + '">';
      html += '<span class="timeline-dot"></span>';
      html += '<span class="timeline-time">' + esc(time) + '</span>';
      html += '<span class="timeline-kind">' + icon + ' ' + esc(ev.kind) + '</span>';
      html += '<span class="timeline-msg">' + esc(ev.message) + '</span>';
      html += '</li>';
    }
    html += '</ul></div>';
    $sessionTimeline.innerHTML = html;

    var toggleBtn = document.getElementById('timeline-toggle-btn');
    var timelineList = document.getElementById('timeline-list');
    if (toggleBtn && timelineList) {
      toggleBtn.onclick = function() {
        if (timelineList.style.display === 'none') {
          timelineList.style.display = '';
          toggleBtn.textContent = 'Hide';
        } else {
          timelineList.style.display = 'none';
          toggleBtn.textContent = 'Show';
        }
      };
    }
  }

  function buildDemoTimeline(label, workflowStatus) {
    var now = new Date();
    var events = [];
    function addEvent(kind, message, offsetMs, detail) {
      var ev = {
        kind: kind,
        timestamp: new Date(now.getTime() + offsetMs).toISOString(),
        message: message,
        category: classifyEventKind(kind)
      };
      if (detail) ev.detail = detail;
      events.push(ev);
    }
    addEvent('session_created', 'Session created (demo)', 0);
    addEvent('workspace_bound', 'Workspace bound: demo/' + label, 100);
    addEvent('workspace_opened', 'Workspace opened: demo/' + label + ' (git repo)', 150, { path: 'demo/' + label, isGitRepo: true });
    addEvent('mcp_attach_requested', 'MCP server attach requested: code-assistant', 200, { serverId: 'code-assistant' });
    addEvent('mcp_attached', 'MCP server attached: code-assistant', 250, { serverId: 'code-assistant' });
    addEvent('mcp_started', 'MCP server started: code-assistant (pid: 1234)', 300, { serverId: 'code-assistant', pid: 1234 });
    addEvent('mcp_discovered_tools', 'MCP server code-assistant: discovered 3 tools', 350, { serverId: 'code-assistant', tools: ['search', 'edit', 'run'] });
    addEvent('agent_attach_requested', 'Agent attach requested: copilot-agent', 400, { agentId: 'copilot-agent' });
    addEvent('agent_attached', 'Agent attached: copilot-agent', 450, { agentId: 'copilot-agent' });
    addEvent('agent_enabled', 'Agent enabled: copilot-agent', 500, { agentId: 'copilot-agent' });
    addEvent('catalogs_loaded', 'Catalog entries loaded', 600);
    addEvent('host_detected', 'Host profile loaded from demo scenario', 700);
    addEvent('workflow_started', 'Workflow execution started', 800);
    var stages = ['catalog_loading', 'host_acquisition', 'recommendation', 'target_selection', 'compatibility_evaluation', 'install_planning', 'safety_evaluation', 'rendering'];
    for (var si = 0; si < stages.length; si++) {
      addEvent('stage_completed', 'Stage completed: ' + stages[si], 900 + si * 200, { stage: stages[si] });
    }
    if (workflowStatus === 'completed') {
      addEvent('completed', 'Session completed successfully', 2800);
    } else if (workflowStatus === 'completed_requires_approval') {
      addEvent('requires_approval', 'Workflow completed but requires human approval before execution', 2800);
    } else if (workflowStatus === 'blocked') {
      addEvent('blocked', 'Workflow blocked by safety evaluation', 2800);
    } else if (workflowStatus === 'failed') {
      addEvent('failed', 'Workflow failed', 2800);
    } else {
      addEvent('completed', 'Session completed', 2800);
    }
    return events;
  }

  function buildDemoSummary(data) {
    var ws = data.workflow ? data.workflow.status : 'completed';
    return {
      id: 'demo-' + (data.id || 'session'),
      stage: 'done',
      status: ws,
      workspacePath: 'demo/' + (data.label || data.id),
      workspaceSource: 'demo',
      workspaceStatus: 'ready',
      workspaceIsGitRepo: true,
      workspaceRemoteUrl: null,
      workspaceBranch: 'main',
      mcpServerCount: 1,
      mcpServers: [{ id: 'code-assistant', label: 'code-assistant', ready: true }],
      agentCount: 1,
      agents: [{ id: 'copilot-agent', label: 'copilot-agent', ready: true }],
      eventCount: 0,
      approvalRequired: ws === 'completed_requires_approval',
      isBlocked: ws === 'blocked',
      lastError: data.workflow ? data.workflow.error || null : null,
      lastEventMessage: null,
      // Fingerprint / profile (Phase 38)
      detectedLanguages: ['typescript', 'javascript'],
      detectedFrameworks: ['node'],
      isMixedRepo: false,
      profileId: 'typescript-node',
      profileLabel: 'TypeScript (Node.js)',
      primaryLanguage: 'typescript',
      profileSelectionReason: 'strong_language_match',
      profileSelectionExplanation: 'Strong typescript signals detected.',
      profileConfident: true,
    };
  }

  function buildDemoPresence(data) {
    var summary = buildDemoSummary(data);
    var events = buildDemoTimeline(data.label || data.id, data.workflow ? data.workflow.status : 'completed');
    var lastMsg = events.length > 0 ? events[events.length - 1].message : null;
    return {
      sessionStage: summary.stage,
      sessionStatus: summary.status,
      workspaceStatus: summary.workspaceStatus,
      workspacePath: summary.workspacePath,
      mcpServers: summary.mcpServers || [],
      agents: summary.agents || [],
      approvalRequired: summary.approvalRequired,
      isBlocked: summary.isBlocked,
      lastSignificantAction: lastMsg,
    };
  }

  async function loadSessionTimeline(sessionId) {
    if (!sessionId) {
      try {
        var result = await fetchJson('/api/session/current');
        if (result.sessionId) {
          _currentSessionId = result.sessionId;
          renderSessionSummary(result.summary);
          renderTimeline(result.events, false);
          // Console rendering
          var messages = enrichMessages(result.events);
          var presence = {
            sessionStage: result.summary ? result.summary.stage : 'initializing',
            sessionStatus: result.summary ? result.summary.status : 'idle',
            workspaceStatus: result.summary ? result.summary.workspaceStatus : null,
            workspacePath: result.summary ? result.summary.workspacePath : null,
            mcpServers: result.summary ? result.summary.mcpServers || [] : [],
            agents: result.summary ? result.summary.agents || [] : [],
            approvalRequired: result.summary ? result.summary.approvalRequired : false,
            isBlocked: result.summary ? result.summary.isBlocked : false,
            lastSignificantAction: result.summary ? result.summary.lastEventMessage : null,
          };
          renderConsoleFull(messages, presence);
        } else {
          renderSessionSummary(null);
          renderTimeline([], false);
          clearConsole();
        }
      } catch(e) {
        renderSessionSummary(null);
        renderTimeline([], false);
        clearConsole();
      }
      return;
    }
    try {
      var summary = await fetchJson('/api/session/' + encodeURIComponent(sessionId) + '/summary');
      var timeline = await fetchJson('/api/session/' + encodeURIComponent(sessionId) + '/timeline');
      _currentSessionId = sessionId;
      renderSessionSummary(summary);
      renderTimeline(timeline.events || [], false);
      // Console rendering
      var messages = enrichMessages(timeline.events || []);
      var presence = {
        sessionStage: summary.stage || 'initializing',
        sessionStatus: summary.status || 'idle',
        workspaceStatus: summary.workspaceStatus || null,
        workspacePath: summary.workspacePath || null,
        mcpServers: summary.mcpServers || [],
        agents: summary.agents || [],
        approvalRequired: summary.approvalRequired || false,
        isBlocked: summary.isBlocked || false,
        lastSignificantAction: summary.lastEventMessage || null,
      };
      renderConsoleFull(messages, presence);
    } catch (e) {
      renderSessionSummary(null);
      renderTimeline([], false);
      clearConsole();
    }
  }

  function showDemoTimeline(data) {
    var summary = buildDemoSummary(data);
    var events = buildDemoTimeline(data.label || data.id, data.workflow ? data.workflow.status : 'completed');
    summary.eventCount = events.length;
    renderSessionSummary(summary);
    renderTimeline(events, true);
    // Console rendering
    var messages = enrichMessages(events);
    var presence = buildDemoPresence(data);
    renderConsoleFull(messages, presence);
  }

  function clearTimeline() {
    $sessionSummary.innerHTML = '';
    $sessionTimeline.innerHTML = '';
    clearConsole();
    _currentSessionId = null;
  }

  // ── Phase 28: Command Composer ──────────────────────────────────────

  var $commandComposer = document.getElementById('command-composer');
  var $commandSelect = document.getElementById('command-select');
  var $commandSubmit = document.getElementById('command-submit-btn');
  var $commandDesc = document.getElementById('command-description');
  var $commandFields = document.getElementById('command-fields');
  var $commandValidation = document.getElementById('command-validation');
  var $commandResult = document.getElementById('command-result');
  var _commandDefs = [];
  var _commandAvailability = {};

  /** Field definitions per command type. */
  var COMMAND_FIELD_DEFS = {
    open_workspace: [
      { name: 'path', label: 'Workspace Path', placeholder: '/home/user/project', required: true }
    ],
    clone_repository: [
      { name: 'url', label: 'Clone URL', placeholder: 'https://github.com/org/repo.git', required: true },
      { name: 'targetPath', label: 'Target Path', placeholder: '/home/user/repos/repo', required: true },
      { name: 'branch', label: 'Branch (optional)', placeholder: 'main', required: false }
    ],
    detect_host: [],
    attach_mcp: [
      { name: 'serverId', label: 'Server ID', placeholder: 'my-mcp-server', required: true },
      { name: 'command', label: 'Command', placeholder: 'npx mcp-server', required: true },
      { name: 'label', label: 'Label (optional)', placeholder: 'My MCP Server', required: false }
    ],
    refresh_mcp_health: [
      { name: 'serverId', label: 'Server ID', placeholder: 'my-mcp-server', required: true }
    ],
    refresh_mcp_discovery: [
      { name: 'serverId', label: 'Server ID', placeholder: 'my-mcp-server', required: true }
    ],
    attach_agent: [
      { name: 'agentId', label: 'Agent ID', placeholder: 'agent-1', required: true },
      { name: 'name', label: 'Agent Name', placeholder: 'Code Review Agent', required: true },
      { name: 'kind', label: 'Kind (optional)', placeholder: 'llm', required: false }
    ],
    run_workflow: [
      { name: 'dataDir', label: 'Data Directory', placeholder: '/path/to/data', required: true },
      { name: 'hostFile', label: 'Host File (optional)', placeholder: '/path/to/host.json', required: false },
      { name: 'artifactId', label: 'Artifact ID (optional)', placeholder: '', required: false },
      { name: 'stopAfter', label: 'Stop After Stage (optional)', placeholder: '', required: false }
    ],
    save_session: [],
    restore_session: [
      { name: 'sessionId', label: 'Session ID', placeholder: 'session-xxx', required: true }
    ]
  };

  /** Load command definitions and availability from the server. */
  async function initCommandComposer() {
    try {
      var defsRes = await fetch('/api/commands');
      if (defsRes.ok) _commandDefs = await defsRes.json();
    } catch (e) { /* ignore */ }
    await refreshCommandAvailability();
    renderCommandSelect();
    $commandComposer.style.display = 'block';
  }

  /** Refresh command availability from the server. */
  async function refreshCommandAvailability() {
    try {
      var availRes = await fetch('/api/commands/availability');
      if (availRes.ok) {
        var items = await availRes.json();
        _commandAvailability = {};
        items.forEach(function(a) { _commandAvailability[a.commandId] = a; });
      }
    } catch (e) { /* ignore */ }
  }

  /** Populate the command select dropdown. */
  function renderCommandSelect() {
    var html = '<option value="">\\u2014 Select command \\u2014</option>';
    var categories = {};
    _commandDefs.forEach(function(def) {
      if (!categories[def.category]) categories[def.category] = [];
      categories[def.category].push(def);
    });
    Object.keys(categories).forEach(function(cat) {
      html += '<optgroup label="' + cat.charAt(0).toUpperCase() + cat.slice(1) + '">';
      categories[cat].forEach(function(def) {
        var avail = _commandAvailability[def.id];
        var disabled = avail && !avail.available;
        var suffix = disabled ? ' (unavailable)' : '';
        html += '<option value="' + def.id + '"' + (disabled ? ' disabled' : '') + '>' + def.label + suffix + '</option>';
      });
      html += '</optgroup>';
    });
    $commandSelect.innerHTML = html;
  }

  /** Render input fields for the selected command. */
  function renderCommandFields(commandId) {
    var fields = COMMAND_FIELD_DEFS[commandId] || [];
    if (fields.length === 0) {
      $commandFields.innerHTML = '<span class="muted" style="font-size:.85rem;">No input required.</span>';
      return;
    }
    var html = '';
    fields.forEach(function(f) {
      html += '<label>' + f.label + (f.required ? ' <span style="color:#dc3545;">*</span>' : '');
      html += '<input type="text" id="cmd-field-' + f.name + '" name="' + f.name + '"';
      html += ' placeholder="' + (f.placeholder || '') + '"';
      html += (f.required ? ' required' : '') + ' />';
      html += '</label>';
    });
    $commandFields.innerHTML = html;
  }

  /** Gather field values for the selected command. */
  function gatherCommandData(commandId) {
    var fields = COMMAND_FIELD_DEFS[commandId] || [];
    var data = {};
    fields.forEach(function(f) {
      var el = document.getElementById('cmd-field-' + f.name);
      if (el && el.value.trim()) data[f.name] = el.value.trim();
      else if (el) data[f.name] = '';
    });
    return data;
  }

  /** Client-side validation before submit. */
  function clientValidateCommand(commandId, data) {
    var fields = COMMAND_FIELD_DEFS[commandId] || [];
    var errors = [];
    fields.forEach(function(f) {
      if (f.required && (!data[f.name] || !data[f.name].trim())) {
        errors.push(f.label + ' is required.');
      }
    });
    return errors;
  }

  /** Show validation errors in the UI. */
  function showCommandValidation(errors) {
    if (errors.length === 0) {
      $commandValidation.style.display = 'none';
      return;
    }
    $commandValidation.className = 'command-validation validation-error';
    $commandValidation.innerHTML = errors.map(function(e) { return '\\u26a0 ' + e; }).join('<br>');
    $commandValidation.style.display = 'block';
  }

  /** Show command execution result. */
  function showCommandResult(result) {
    $commandResult.className = 'command-result result-' + (result.status || 'failed');
    var icon = result.status === 'completed' ? '\\u2705' : result.status === 'validation_failed' ? '\\u26a0\\ufe0f' : '\\u274c';
    $commandResult.innerHTML = icon + ' ' + (result.message || 'Unknown result.');
    $commandResult.style.display = 'block';
  }

  $commandSelect.addEventListener('change', function() {
    var cmdId = $commandSelect.value;
    $commandValidation.style.display = 'none';
    $commandResult.style.display = 'none';
    if (!cmdId) {
      $commandDesc.textContent = '';
      $commandFields.innerHTML = '';
      $commandSubmit.disabled = true;
      return;
    }
    var def = _commandDefs.find(function(d) { return d.id === cmdId; });
    $commandDesc.textContent = def ? def.description : '';
    renderCommandFields(cmdId);
    $commandSubmit.disabled = false;
  });

  $commandSubmit.addEventListener('click', async function() {
    var cmdId = $commandSelect.value;
    if (!cmdId) return;
    var data = gatherCommandData(cmdId);
    // Client validation
    var errors = clientValidateCommand(cmdId, data);
    if (errors.length > 0) {
      showCommandValidation(errors);
      return;
    }
    showCommandValidation([]);
    $commandSubmit.disabled = true;
    $commandSubmit.textContent = 'Running\\u2026';
    try {
      var body = JSON.stringify({ commandId: cmdId, data: data });
      var resp = await fetch('/api/commands/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body });
      var result = await resp.json();
      showCommandResult(result);
      // Refresh session timeline/console after command execution
      if (_currentSessionId) {
        await loadSessionTimeline(_currentSessionId);
      } else {
        // Try loading current session
        try {
          var currentRes = await fetch('/api/session/current');
          if (currentRes.ok) {
            var currentData = await currentRes.json();
            if (currentData.sessionId) {
              _currentSessionId = currentData.sessionId;
              await loadSessionTimeline(_currentSessionId);
            }
          }
        } catch (e) { /* ignore */ }
      }
      // Refresh command availability after execution
      await refreshCommandAvailability();
      renderCommandSelect();
      // Re-select the command that was just run
      $commandSelect.value = cmdId;
    } catch (e) {
      showCommandResult({ status: 'failed', message: 'Network error: ' + e.message });
    } finally {
      $commandSubmit.disabled = false;
      $commandSubmit.textContent = 'Run';
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────

  // Desktop detection: update title when running in Electron wrapper
  if (window.desktop && window.desktop.isDesktop) {
    document.title = window.desktop.appName + ' — Desktop';
    var h1 = document.querySelector('header h1');
    if (h1) h1.textContent = window.desktop.appName;
  }

  restoreInputs();
  switchMode();
  initDemo();
  initStages();
  initCommandComposer();
})();
`;
