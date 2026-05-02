import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RouteSummary, FileFunctionEntry } from './LensApiClient';

function formatMs(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}μs` : `${ms.toFixed(0)}ms`;
}

function getBeetleSvgDataUri(extensionPath: string): string {
  try {
    const svgPath = path.join(extensionPath, 'media', 'beetle-icon.svg');
    const svg = fs.readFileSync(svgPath, 'utf8');
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  } catch {
    return '';
  }
}

// ── SVG donut chart ───────────────────────────────────────────────────────────
// r=44, circumference = 2π*44 ≈ 276.46
function donutChart(pct: number, color: string, label: string, sublabel: string): string {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(pct, 100)) / 100 * circ;
  const gap = circ - filled;
  return `
  <div class="donut-wrap">
    <svg viewBox="0 0 100 100" class="donut-svg">
      <circle cx="50" cy="50" r="${r}" fill="none" stroke="#2a2a3e" stroke-width="11"/>
      <circle cx="50" cy="50" r="${r}" fill="none"
        stroke="${color}" stroke-width="11"
        stroke-dasharray="${filled.toFixed(2)} ${gap.toFixed(2)}"
        stroke-dashoffset="${(circ * 0.25).toFixed(2)}"
        stroke-linecap="round"
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="46" text-anchor="middle" class="donut-val" fill="${color}">${label}</text>
      <text x="50" y="60" text-anchor="middle" class="donut-sub" fill="#6c7086">${sublabel}</text>
    </svg>
  </div>`;
}

// ── Horizontal bar ────────────────────────────────────────────────────────────
function latencyBar(label: string, value: number, max: number, color: string): string {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `
  <div class="bar-row">
    <span class="bar-label">${label}</span>
    <div class="bar-track">
      <div class="bar-fill" style="width:${pct}%; background:${color}"></div>
    </div>
    <span class="bar-value" style="color:${color}">${formatMs(value)}</span>
  </div>`;
}

function chartsHtml(avgMs: number, p95Ms: number, errPct: number): string {
  const maxLat = p95Ms;
  const errColor  = errPct > 5 ? '#f87171' : errPct > 0 ? '#fbbf24' : '#4ade80';
  const avgColor  = '#818cf8';
  const p95Color  = '#a78bfa';

  // latency gauge: scale avg against p95
  const avgPct = maxLat > 0 ? (avgMs / maxLat) * 100 : 50;

  return `
  <div class="charts-row">
    <div class="chart-block">
      <div class="section-title">Latency</div>
      <div class="donuts-row">
        ${donutChart(Math.min(avgPct, 100), avgColor, formatMs(avgMs), 'avg')}
        ${donutChart(100, p95Color, formatMs(p95Ms), 'p95')}
      </div>
      <div class="bars">
        ${latencyBar('avg', avgMs, maxLat, avgColor)}
        ${latencyBar('p95', p95Ms, maxLat, p95Color)}
      </div>
    </div>

    <div class="chart-block">
      <div class="section-title">Error rate</div>
      <div class="donuts-row center">
        ${donutChart(errPct, errColor, errPct.toFixed(1) + '%', 'errors')}
      </div>
      <div class="err-note" style="color:${errColor}">
        ${errPct === 0 ? '✓ No errors' : errPct > 5 ? '⚠ High error rate' : '△ Some errors'}
      </div>
    </div>
  </div>`;
}

function topBar(logoUri: string): string {
  const logo = logoUri
    ? `<img src="${logoUri}" class="beetle-logo" alt="Beetle">`
    : '🪲';
  return `
  <div class="top-bar">
    <div class="brand">${logo}<span class="brand-name">Beetle Lens</span></div>
    <span class="window-label">last 24h</span>
  </div>`;
}

function routeHtml(r: RouteSummary, logoUri: string): string {
  const confBadge = r.lowConfidence
    ? `<span class="badge warn">low data</span>`
    : `<span class="badge ok">confident</span>`;

  return `
    ${topBar(logoUri)}
    <div class="card">
      <div class="card-header">
        <span class="method ${r.httpMethod.toLowerCase()}">${r.httpMethod}</span>
        <span class="route-path">${r.httpRoute}</span>
        ${confBadge}
      </div>

      <div class="stats-grid">
        <div class="stat"><div class="stat-value">${r.sampleCount.toLocaleString()}</div><div class="stat-label">Requests</div></div>
        <div class="stat"><div class="stat-value">${formatMs(r.avgLatencyMs)}</div><div class="stat-label">Avg latency</div></div>
        <div class="stat"><div class="stat-value">${formatMs(r.p95Ms)}</div><div class="stat-label">p95 latency</div></div>
        <div class="stat"><div class="stat-value" style="color:${r.errorRatePct > 5 ? '#f87171' : r.errorRatePct > 0 ? '#fbbf24' : '#4ade80'}">${r.errorRatePct.toFixed(1)}%</div><div class="stat-label">Error rate</div></div>
      </div>

      ${chartsHtml(r.avgLatencyMs, r.p95Ms, r.errorRatePct)}
    </div>`;
}

function functionHtml(entry: FileFunctionEntry, filePath: string, logoUri: string): string {
  const confBadge = entry.lowConfidence
    ? `<span class="badge warn">low data</span>`
    : `<span class="badge ok">confident</span>`;

  return `
    ${topBar(logoUri)}
    <div class="card">
      <div class="card-header">
        <span class="fn-chip">fn</span>
        <span class="route-path">${entry.functionName}</span>
        ${confBadge}
      </div>
      <div class="filepath">${filePath}</div>

      <div class="stats-grid">
        <div class="stat"><div class="stat-value">${entry.sampleCount.toLocaleString()}</div><div class="stat-label">Calls</div></div>
        <div class="stat"><div class="stat-value">${formatMs(entry.avgLatencyMs)}</div><div class="stat-label">Avg latency</div></div>
        <div class="stat"><div class="stat-value">${formatMs(entry.p95Ms)}</div><div class="stat-label">p95 latency</div></div>
        <div class="stat"><div class="stat-value" style="color:${entry.errorRatePct > 5 ? '#f87171' : entry.errorRatePct > 0 ? '#fbbf24' : '#4ade80'}">${entry.errorRatePct.toFixed(1)}%</div><div class="stat-label">Error rate</div></div>
      </div>

      ${chartsHtml(entry.avgLatencyMs, entry.p95Ms, entry.errorRatePct)}
    </div>`;
}

function buildHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--vscode-editor-background, #0f0f1a);
  color: var(--vscode-editor-foreground, #cdd6f4);
  font-size: 13px;
  line-height: 1.5;
  min-height: 100vh;
}

/* ── Top bar ── */
.top-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid #1e1e30;
  background: #0a0a14;
}
.brand { display: flex; align-items: center; gap: 8px; }
.beetle-logo { width: 22px; height: 22px; object-fit: contain; filter: brightness(0) invert(1); opacity: 0.75; }
.brand-name { font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color: #4a4a6a; text-transform: uppercase; }
.window-label { font-size: 10px; padding: 3px 10px; border-radius: 12px; background: #1a1a2e; color: #4a4a6a; font-weight: 700; border: 1px solid #2a2a40; letter-spacing: 0.5px; }

/* ── Card ── */
.card { padding: 22px 20px; }
.card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 22px; flex-wrap: wrap; }

/* ── Method / fn chip ── */
.method { font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 6px; letter-spacing: 0.8px; text-transform: uppercase; }
.method.get    { background: #0d1f3c; color: #60a5fa; border: 1px solid #1d4ed8; }
.method.post   { background: #022c22; color: #34d399; border: 1px solid #059669; }
.method.put    { background: #2d1600; color: #fb923c; border: 1px solid #c2410c; }
.method.patch  { background: #1a0533; color: #c084fc; border: 1px solid #7c3aed; }
.method.delete { background: #2d0000; color: #f87171; border: 1px solid #b91c1c; }
.fn-chip { font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 6px; background: #0d0d2e; color: #818cf8; border: 1px solid #3730a3; letter-spacing: 0.5px; }

.route-path { font-size: 17px; font-weight: 700; color: #e2e8f0; word-break: break-all; }
.filepath { font-size: 11px; color: #4a4a6a; margin-top: -16px; margin-bottom: 20px; word-break: break-all; }
.badge { font-size: 10px; padding: 3px 9px; border-radius: 12px; font-weight: 700; letter-spacing: 0.4px; }
.badge.ok   { background: #022c22; color: #4ade80; border: 1px solid #166534; }
.badge.warn { background: #2d1400; color: #fb923c; border: 1px solid #92400e; }

/* ── Stats grid ── */
.stats-grid {
  display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 26px;
}
.stat {
  background: #0a0a18; border: 1px solid #1e1e30; border-radius: 12px;
  padding: 16px 10px; text-align: center; transition: border-color .15s;
}
.stat:hover { border-color: #3730a3; }
.stat-value { font-size: 20px; font-weight: 800; color: #a6e3a1; line-height: 1.1; letter-spacing: -0.5px; }
.stat-label { font-size: 9px; color: #4a4a6a; margin-top: 5px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; }

/* ── Charts row ── */
.charts-row { display: grid; grid-template-columns: 1fr 180px; gap: 16px; }
.chart-block { background: #0a0a18; border: 1px solid #1e1e30; border-radius: 12px; padding: 16px; }
.section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #4a4a6a; margin-bottom: 14px; font-weight: 800; }

/* ── Donut charts ── */
.donuts-row { display: flex; justify-content: space-around; margin-bottom: 16px; }
.donuts-row.center { justify-content: center; }
.donut-wrap { width: 90px; }
.donut-svg { width: 100%; height: auto; }
.donut-val { font-size: 13px; font-weight: 800; font-family: -apple-system, sans-serif; }
.donut-sub { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; font-family: -apple-system, sans-serif; }

/* ── Latency bars ── */
.bars { display: flex; flex-direction: column; gap: 10px; }
.bar-row { display: grid; grid-template-columns: 32px 1fr 58px; align-items: center; gap: 10px; }
.bar-label { font-size: 10px; color: #4a4a6a; text-align: right; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
.bar-track { background: #1a1a2e; border-radius: 6px; height: 8px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 6px; min-width: 4px; }
.bar-value { font-size: 12px; font-weight: 700; text-align: right; }

/* ── Error note ── */
.err-note { font-size: 12px; font-weight: 700; text-align: center; margin-top: 8px; }
</style>
</head>
<body>${body}</body>
</html>`;
}

let _panel: vscode.WebviewPanel | undefined;
let _extensionPath = '';

export function init(extensionPath: string): void {
  _extensionPath = extensionPath;
}

export function showRouteDetail(route: RouteSummary): void {
  const panel = getOrCreatePanel(`${route.httpMethod} ${route.httpRoute}`);
  panel.webview.html = buildHtml(routeHtml(route, getBeetleSvgDataUri(_extensionPath)));
  panel.reveal(vscode.ViewColumn.Beside, true);
}

export function showFunctionDetail(entry: FileFunctionEntry, filePath: string): void {
  const panel = getOrCreatePanel(entry.functionName);
  panel.webview.html = buildHtml(functionHtml(entry, filePath, getBeetleSvgDataUri(_extensionPath)));
  panel.reveal(vscode.ViewColumn.Beside, true);
}

function getOrCreatePanel(title: string): vscode.WebviewPanel {
  if (_panel) {
    _panel.title = `🪲 ${title}`;
    return _panel;
  }
  const panel = vscode.window.createWebviewPanel(
    'beetleLensDetail',
    `🪲 ${title}`,
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: false, retainContextWhenHidden: true }
  );
  panel.onDidDispose(() => { _panel = undefined; });
  _panel = panel;
  return panel;
}
