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
    </div>
    <div id="validation-result" style="display:none;"></div>
  </div>
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

  // Current detected host profile (if any)
  var _detectedHostProfile = null;
  var _currentHostSource = null; // 'file' | 'detected' | null

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
    return '<div class="card"><h2>\\ud83d\\udcbb Host Summary' + sourceBadgeHtml + '</h2>'
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
    if (!r) return '<div class="card"><h2>\\ud83c\\udfaf Recommendation</h2><p class="muted">No recommendation available for this scenario.</p></div>';
    return '<div class="card"><h2>\\ud83c\\udfaf Recommendation</h2>'
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
    if (!c) return '<div class="card"><h2>\\ud83d\\udd0d Compatibility</h2><p class="muted">Not evaluated in this scenario.</p></div>';
    return '<div class="card"><h2>\\ud83d\\udd0d Compatibility Detail</h2>'
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
    if (!p) return '<div class="card"><h2>\\ud83d\\udccb Install Plan</h2><p class="muted">No plan generated in this scenario.</p></div>';
    var safetyCardClass = '';
    if (p.safety && p.safety.status === 'blocked') safetyCardClass = ' card-blocked';
    else if (p.safety && p.safety.status === 'requiresHumanApproval') safetyCardClass = ' card-approval';
    return '<div class="card' + safetyCardClass + '"><h2>\\ud83d\\udccb Install Plan Review</h2>'
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

    var out = '<div class="card ' + sc.cardClass + '"><h2>\\ud83d\\udce6 Workflow Summary</h2>';

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
    return renderHost(data.host, data.hostSource)
      + renderRecommendation(data.recommendation)
      + renderCompatibility(data.compatibility)
      + renderPlan(data.planReview)
      + renderWorkflow(data.workflow)
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
    var out = '<div class="error-box">';
    out += '<div class="error-title">[' + esc(err.code) + '] ' + esc(err.message) + '</div>';
    if (hint) out += '<div class="error-hint">' + esc(hint) + '</div>';
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
      $app.innerHTML = renderScenario(data);
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
        $app.innerHTML = renderScenario(result.viewModel);
      } else {
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
    $app.innerHTML = '<p class="muted">Configure inputs and click Run Workflow.</p>';
    savePrefs({ mode: 'real' });
  });

  // ── Input event listeners for error clearing ─────────────────────────

  $dataDirInput.addEventListener('input', function() { $dataDirInput.classList.remove('input-error'); });
  $hostFileInput.addEventListener('input', function() { $hostFileInput.classList.remove('input-error'); });

  // ── Init ──────────────────────────────────────────────────────────────

  restoreInputs();
  switchMode();
  initDemo();
  initStages();
})();
`;
