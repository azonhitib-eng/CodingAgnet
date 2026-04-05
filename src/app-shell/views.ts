/**
 * App shell HTML renderer.
 *
 * Generates the single-page HTML application that the shell serves.
 * Uses vanilla HTML/CSS/JS — no framework dependencies.
 * Data is fetched from the JSON API endpoints.
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
    <div class="form-row">
      <label for="data-dir-input">Data Directory:</label>
      <input type="text" id="data-dir-input" placeholder="path/to/data (contains models/, runtimes/, agent-tools/)" />
    </div>
    <div class="form-row">
      <label for="host-file-input">Host Profile File:</label>
      <input type="text" id="host-file-input" placeholder="path/to/host-profile.json" />
    </div>
    <div class="form-row">
      <label for="artifact-input">Artifact ID (optional):</label>
      <input type="text" id="artifact-input" placeholder="e.g. codellama-7b-q4_k_m-ollama" />
    </div>
    <div class="form-row">
      <label for="stop-after-input">Stop After Stage (optional):</label>
      <select id="stop-after-input"><option value="">— run all stages —</option></select>
    </div>
    <div class="form-row">
      <button id="run-workflow-btn" type="button">Run Workflow</button>
      <button id="validate-btn" type="button" class="btn-secondary">Validate Inputs</button>
    </div>
    <div id="validation-result" class="muted" style="display:none;"></div>
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
.badge {
  display: inline-block; padding: .15rem .5rem; border-radius: 3px;
  font-size: .75rem; font-weight: 600; text-transform: uppercase;
}
.badge-info { background: #cff4fc; color: #055160; }
.badge-warning { background: #fff3cd; color: #664d03; }
.badge-error { background: #f8d7da; color: #842029; }
.badge-critical { background: #e2d9f3; color: #432874; }
dl { margin: .5rem 0; }
dt { font-weight: 600; font-size: .85rem; color: var(--muted); margin-top: .5rem; }
dd { margin: 0 0 0 0; }
table { width: 100%; border-collapse: collapse; font-size: .9rem; }
th, td { text-align: left; padding: .4rem .5rem; border-bottom: 1px solid var(--card-border); }
th { font-size: .8rem; color: var(--muted); text-transform: uppercase; }
.stage-list { list-style: none; padding: 0; margin: .5rem 0; }
.stage-list li { padding: .25rem 0; font-size: .9rem; }
.stage-list li::before { content: '○ '; color: var(--muted); }
.stage-list li.completed::before { content: '● '; color: var(--success); }
.step-grid { display: grid; gap: .5rem; }
.step-item { padding: .5rem .75rem; border: 1px solid var(--card-border); border-radius: 4px; font-size: .9rem; }
.step-item code { font-family: 'SF Mono', 'Consolas', monospace; font-size: .82rem; background: #f1f3f5; padding: .1rem .3rem; border-radius: 2px; }
ul.plain { list-style: disc; padding-left: 1.25rem; margin: .25rem 0; font-size: .9rem; }
.error-box { background: #f8d7da; border: 1px solid #f5c2c7; border-radius: 4px; padding: .75rem; color: #842029; font-size: .9rem; }
#mode-nav { padding: .5rem 1.5rem; border-bottom: 1px solid var(--card-border); background: var(--card-bg); display: flex; align-items: center; gap: .75rem; }
#mode-nav label { font-weight: 600; }
#mode-nav select { padding: .35rem .5rem; border-radius: 4px; border: 1px solid var(--card-border); }
.real-form { padding: .75rem 1.5rem; border-bottom: 1px solid var(--card-border); background: var(--card-bg); }
.form-row { display: flex; align-items: center; gap: .75rem; margin-bottom: .5rem; flex-wrap: wrap; }
.form-row label { font-weight: 600; font-size: .9rem; min-width: 180px; }
.form-row input[type="text"] { flex: 1; min-width: 200px; padding: .35rem .5rem; border-radius: 4px; border: 1px solid var(--card-border); font-size: .9rem; }
.form-row select { padding: .35rem .5rem; border-radius: 4px; border: 1px solid var(--card-border); }
.form-row button { padding: .4rem 1rem; border-radius: 4px; border: 1px solid var(--accent); background: var(--accent); color: #fff; font-weight: 600; cursor: pointer; font-size: .9rem; }
.form-row button:hover { opacity: .9; }
.form-row .btn-secondary { background: var(--card-bg); color: var(--fg); border-color: var(--card-border); }
`;

// ---------------------------------------------------------------------------
// Client-side JavaScript
// ---------------------------------------------------------------------------

const CLIENT_JS = `
(function() {
  var $modeSelect = document.getElementById('mode-select');
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
  var $validationResult = document.getElementById('validation-result');

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

  function badge(severity) {
    return '<span class="badge badge-' + severity + '">' + severity + '</span>';
  }

  function esc(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  // ── Host summary ──────────────────────────────────────────────────────

  function renderHost(h) {
    return '<div class="card"><h2>Host Summary</h2>'
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
    if (!r) return '<div class="card"><h2>Recommendation</h2><p class="muted">No recommendation available for this scenario.</p></div>';
    return '<div class="card"><h2>Recommendation</h2>'
      + '<p><strong>' + esc(r.displayName) + '</strong> ' + badge(r.compatibilitySeverity) + '</p>'
      + '<dl>'
      + '<dt>Score</dt><dd>' + r.score + '</dd>'
      + '<dt>Compatibility</dt><dd>' + esc(r.compatibilityLabel) + '</dd>'
      + '</dl>'
      + '<h3>Explanations</h3><ul class="plain">' + r.explanations.map(function(e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>'
      + (r.warnings.length > 0 ? '<h3>Warnings</h3><ul class="plain">' + r.warnings.map(function(w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '')
      + '</div>';
  }

  // ── Compatibility ─────────────────────────────────────────────────────

  function renderCompatibility(c) {
    if (!c) return '<div class="card"><h2>Compatibility</h2><p class="muted">Not evaluated in this scenario.</p></div>';
    return '<div class="card"><h2>Compatibility Detail</h2>'
      + '<p>' + badge(c.severity) + ' <strong>' + esc(c.label) + '</strong></p>'
      + '<p>' + esc(c.summaryMessage) + '</p>'
      + '<dl>'
      + '<dt>GPU Offload</dt><dd>' + (c.gpuOffloadPossible ? 'Yes' + (c.estimatedGpuLayers != null ? ' (' + c.estimatedGpuLayers + ' layers)' : '') : 'No') + '</dd>'
      + '<dt>Disk Swap Required</dt><dd>' + (c.requiresDiskSwap ? 'Yes' : 'No') + '</dd>'
      + (c.effectiveContextWindow != null ? '<dt>Context Window</dt><dd>' + c.effectiveContextWindow + ' tokens</dd>' : '')
      + '</dl>'
      + (c.reasons.length > 0 ? '<h3>Reasons</h3><ul class="plain">' + c.reasons.map(function(r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' : '')
      + (c.warnings.length > 0 ? '<h3>Warnings</h3><ul class="plain">' + c.warnings.map(function(w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '')
      + (c.settingsAdjustments.length > 0 ? '<h3>Settings Adjustments</h3><table><tr><th>Parameter</th><th>Suggested</th><th>Reason</th></tr>'
        + c.settingsAdjustments.map(function(a) { return '<tr><td>' + esc(a.parameter) + '</td><td>' + esc(a.suggestedValue) + '</td><td>' + esc(a.reason) + '</td></tr>'; }).join('')
        + '</table>' : '')
      + '</div>';
  }

  // ── Plan review ───────────────────────────────────────────────────────

  function renderPlan(p) {
    if (!p) return '<div class="card"><h2>Install Plan</h2><p class="muted">No plan generated in this scenario.</p></div>';
    return '<div class="card"><h2>Install Plan Review</h2>'
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
          return '<div class="step-item">'
            + '<strong>Step ' + s.order + '</strong> ' + badge(s.riskSeverity)
            + (s.requiresApproval ? ' <em>(requires approval)</em>' : '')
            + '<br><code>' + esc(s.command) + '</code>'
            + '<br><span class="muted">' + esc(s.description) + '</span></div>';
        }).join('')
      + '</div>'
      + (p.prerequisites.length > 0 ? '<h3>Prerequisites</h3><ul class="plain">'
        + p.prerequisites.map(function(pr) { return '<li><strong>' + esc(pr.name) + '</strong>: ' + esc(pr.installHint) + '</li>'; }).join('') + '</ul>' : '')
      + (p.risks.length > 0 ? '<h3>Risks</h3><ul class="plain">' + p.risks.map(function(r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' : '')
      + renderSafety(p.safety)
      + '</div>';
  }

  // ── Safety status ─────────────────────────────────────────────────────

  function renderSafety(s) {
    if (!s) return '';
    return '<h3>Safety</h3>'
      + '<p>' + badge(s.severity) + ' <strong>' + esc(s.label) + '</strong></p>'
      + '<p>' + esc(s.summaryMessage) + '</p>'
      + (s.violations.length > 0 ? '<table><tr><th>Step</th><th>Type</th><th>Description</th><th>Severity</th></tr>'
        + s.violations.map(function(v) { return '<tr><td>' + v.stepIndex + '</td><td>' + esc(v.type) + '</td><td>' + esc(v.description) + '</td><td>' + badge(v.severity) + '</td></tr>'; }).join('')
        + '</table>' : '')
      + (s.warnings.length > 0 ? '<ul class="plain">' + s.warnings.map(function(w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '');
  }

  // ── Workflow summary ──────────────────────────────────────────────────

  function renderWorkflow(w) {
    return '<div class="card"><h2>Workflow Summary</h2>'
      + '<p>' + badge(w.statusSeverity) + ' <strong>' + esc(w.statusLabel) + '</strong></p>'
      + '<p>' + esc(w.statusSummary) + '</p>'
      + (w.error ? '<div class="error-box"><strong>Error:</strong> ' + esc(w.error) + '</div>' : '')
      + (w.stoppedAfter ? '<p class="muted">Stopped after: ' + esc(w.stoppedAfter) + '</p>' : '')
      + '<h3>Stages</h3><ul class="stage-list">'
      + w.stages.map(function(s) {
          return '<li class="' + (s.completed ? 'completed' : '') + '">' + esc(s.label) + '</li>';
        }).join('')
      + '</ul></div>';
  }

  // ── Full render ───────────────────────────────────────────────────────

  function renderScenario(data) {
    return renderHost(data.host)
      + renderRecommendation(data.recommendation)
      + renderCompatibility(data.compatibility)
      + renderPlan(data.planReview)
      + renderWorkflow(data.workflow);
  }

  // ── Error render ──────────────────────────────────────────────────────

  function renderError(err) {
    return '<div class="error-box">'
      + '<strong>[' + esc(err.code) + ']</strong> ' + esc(err.message)
      + '</div>';
  }

  // ── Mode switching ────────────────────────────────────────────────────

  $modeSelect.addEventListener('change', function() {
    var mode = $modeSelect.value;
    $demoControls.style.display = mode === 'demo' ? '' : 'none';
    $realControls.style.display = mode === 'real' ? '' : 'none';
    $app.innerHTML = mode === 'demo'
      ? '<p class="muted">Select a scenario above to begin.</p>'
      : '<p class="muted">Configure inputs and click Run Workflow.</p>';
    $validationResult.style.display = 'none';
  });

  // ── Demo mode: scenario selection ─────────────────────────────────────

  async function initDemo() {
    try {
      var scenarios = await fetchJson('/api/scenarios');
      $select.innerHTML = '<option value="">\\u2014 choose a scenario \\u2014</option>'
        + scenarios.map(function(s) {
            return '<option value="' + esc(s.id) + '">' + esc(s.label) + '</option>';
          }).join('');
    } catch (e) {
      $app.innerHTML = '<div class="error-box">Failed to load scenarios: ' + esc(e.message) + '</div>';
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
      $app.innerHTML = '<div class="error-box">Failed to load scenario: ' + esc(e.message) + '</div>';
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
    $validationResult.innerHTML = 'Validating\\u2026';

    try {
      var result = await postJson('/api/workflow/validate', body);
      var lines = [];
      var v = result.validations || {};
      for (var k in v) {
        if (v[k].valid) {
          lines.push('\\u2714 ' + k + ': valid');
        } else {
          lines.push('\\u2718 ' + k + ': ' + esc(v[k].error));
        }
      }
      $validationResult.innerHTML = lines.length > 0 ? lines.join('<br>') : 'No fields to validate.';
    } catch (e) {
      $validationResult.innerHTML = 'Validation request failed: ' + esc(e.message);
    }
  });

  // ── Real mode: run workflow ───────────────────────────────────────────

  $runBtn.addEventListener('click', async function() {
    var dataDir = $dataDirInput.value.trim();
    var hostFile = $hostFileInput.value.trim();
    if (!dataDir || !hostFile) {
      $app.innerHTML = '<div class="error-box">Data Directory and Host Profile File are required.</div>';
      return;
    }

    var body = { dataDir: dataDir, hostFile: hostFile };
    if ($artifactInput.value.trim()) body.artifactId = $artifactInput.value.trim();
    if ($stopAfterInput.value) body.stopAfter = $stopAfterInput.value;

    $app.innerHTML = '<p class="muted">Running workflow\\u2026</p>';
    $validationResult.style.display = 'none';

    try {
      var result = await postJson('/api/workflow/run', body);
      if (result.ok) {
        $app.innerHTML = renderScenario(result.viewModel);
      } else {
        $app.innerHTML = renderError(result.error);
      }
    } catch (e) {
      $app.innerHTML = '<div class="error-box">Workflow request failed: ' + esc(e.message) + '</div>';
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────

  initDemo();
  initStages();
})();
`;
