import * as vscode from 'vscode';
import { CodelyReport } from '@codely/core';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function scoreColor(score: number, lowIsGood = false): string {
  const v = lowIsGood ? 10 - score : score;
  if (v >= 8) return 'var(--codely-good)';
  if (v >= 5) return 'var(--codely-ok)';
  return 'var(--codely-bad)';
}

function bar(score: number, lowIsGood = false): string {
  const pct = Math.round((score / 10) * 100);
  return `
    <div class="bar">
      <div class="bar-fill" style="width:${pct}%; background:${scoreColor(score, lowIsGood)}"></div>
    </div>
    <div class="bar-label">${score}/10</div>
  `;
}

function renderHtml(report: CodelyReport, title: string, appVersion: string): string {
  const r = report;
  const structure = r.structure_breakdown
    .map(
      (s) => `
      <div class="card structure-card">
        <div class="structure-part">${escapeHtml(s.part)}</div>
        <div class="structure-row"><span class="muted">why:</span> ${escapeHtml(s.responsibility)}</div>
        <div class="structure-row"><span class="muted">how:</span> ${escapeHtml(s.logic)}</div>
      </div>`,
    )
    .join('');

  const flow = r.high_level_flow
    .map((s, i) => `<li><span class="step-num">${i + 1}</span>${escapeHtml(s)}</li>`)
    .join('');

  const dataFlow = r.data_flow.map((s) => `<li>${escapeHtml(s)}</li>`).join('');
  const fatigueReasons = r.code_fatigue_analysis.fatigue_reason.map((s) => `<li>${escapeHtml(s)}</li>`).join('');
  const risks = r.code_fatigue_analysis.risk_points.map((s) => `<li class="risk">${escapeHtml(s)}</li>`).join('');
  const refactors = r.refactoring_suggestions
    .map((s) => `<li><strong>${escapeHtml(s.title)}</strong>: ${escapeHtml(s.description)}</li>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
  <title>Codely Report</title>
  <style>
    :root {
      --codely-good: #4ec9b0;
      --codely-ok:   #d7ba7d;
      --codely-bad:  #f48771;
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 24px 32px 80px;
      line-height: 1.5;
      max-width: 1100px;
      margin: 0 auto;
    }
    h1 { font-size: 1.4em; margin: 0 0 4px; font-weight: 600; }
    h2 {
      font-size: 0.95em;
      margin: 28px 0 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--vscode-descriptionForeground);
      font-weight: 600;
    }
    .title-bar {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      padding-bottom: 16px;
      margin-bottom: 8px;
    }
    .title-meta {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 0.78em;
      margin-left: 6px;
    }
    .scores-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin: 16px 0 8px;
    }
    .score-card {
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 6px;
      padding: 12px 14px;
    }
    .score-label {
      font-size: 0.78em;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 6px;
    }
    .bar {
      height: 8px;
      background: var(--vscode-input-background);
      border-radius: 999px;
      overflow: hidden;
      margin-bottom: 6px;
    }
    .bar-fill { height: 100%; transition: width 200ms; }
    .bar-label { font-size: 0.85em; color: var(--vscode-foreground); font-weight: 500; }
    .prose { margin: 0 0 6px; }
    .muted { color: var(--vscode-descriptionForeground); }
    .card {
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 8px;
    }
    .structure-card .structure-part {
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
      color: var(--vscode-symbolIcon-functionForeground, var(--vscode-foreground));
      margin-bottom: 4px;
    }
    .structure-row { font-size: 0.92em; margin: 2px 0; }
    ol, ul { padding-left: 22px; margin: 4px 0; }
    li { margin: 4px 0; }
    .step-num {
      display: inline-block;
      width: 1.8em;
      color: var(--vscode-descriptionForeground);
      font-variant-numeric: tabular-nums;
    }
    .risk {
      color: var(--vscode-editorWarning-foreground, var(--codely-bad));
    }
    .fatigue-block {
      display: grid;
      grid-template-columns: 200px 1fr;
      gap: 20px;
      align-items: start;
    }
    .checklist li::marker { content: "✓  "; color: var(--codely-good); }
    .summary-quote {
      font-size: 1.05em;
      padding: 10px 14px;
      border-left: 3px solid var(--vscode-textLink-foreground);
      background: var(--vscode-textBlockQuote-background, transparent);
      margin: 8px 0;
    }
    .intent-line { font-style: italic; color: var(--vscode-descriptionForeground); margin: 4px 0 0; }
    .footer-note {
      margin-top: 40px;
      padding-top: 12px;
      border-top: 1px dashed var(--vscode-widget-border, var(--vscode-panel-border));
      font-size: 0.82em;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="title-bar">
    <div>
      <h1>Codely Report</h1>
      <div class="title-meta">${escapeHtml(title)}</div>
    </div>
    <div>
      <span class="badge">v${escapeHtml(appVersion)}</span>
      <span class="badge">local-only</span>
    </div>
  </div>

  <div class="summary-quote">${escapeHtml(r.summary)}</div>
  <div class="intent-line">${escapeHtml(r.intent)}</div>

  <div class="scores-grid">
    <div class="score-card">
      <div class="score-label">Readability</div>
      ${bar(r.complexity_analysis.readability_score)}
    </div>
    <div class="score-card">
      <div class="score-label">Maintainability</div>
      ${bar(r.complexity_analysis.maintainability_score)}
    </div>
    <div class="score-card">
      <div class="score-label">Code Fatigue</div>
      ${bar(r.code_fatigue_analysis.fatigue_score, true)}
    </div>
  </div>
  <p class="prose muted" style="margin-top:2px">Time complexity estimate: ${escapeHtml(r.complexity_analysis.time_complexity_estimate)}</p>

  <p class="prose muted" style="margin-top:14px">
    <strong>About these scores:</strong> JavaScript/TypeScript metrics come from a local AST (Babel). C-family and JVM buffers use a masked-text heuristic, not a compiler front-end — treat numbers as directional signals, not proof. Use <code>// codely-disable-next-line</code>, <code>// codely-disable-line</code>, or <code>// codely-disable-file</code> in source to silence editor diagnostics where intentional.
  </p>

  <h2>High-level flow</h2>
  <ol>${flow}</ol>

  <h2>Structure breakdown</h2>
  ${structure || '<p class="muted">No functions or classes detected.</p>'}

  <h2>Data flow</h2>
  <ul>${dataFlow}</ul>

  <h2>Code fatigue</h2>
  <div class="card">
    <ul>${fatigueReasons}</ul>
  </div>
  ${risks ? `<h2>Risk points</h2><ul>${risks}</ul>` : ''}

  <h2>Refactoring suggestions</h2>
  <ul class="checklist">${refactors}</ul>

  <h2>Human translation</h2>
  <p class="prose">${escapeHtml(r.human_translation)}</p>

  <div class="footer-note">
    Codely v${escapeHtml(appVersion)} — fully local AST analysis. No code is sent over the network.
    Patterns and intent are inferred heuristically; treat them as starting hypotheses, not ground truth.
  </div>
</body>
</html>`;
}

export class ReportPanel {
  private static current: ReportPanel | undefined;
  private readonly panel: vscode.WebviewPanel;

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.onDidDispose(() => {
      if (ReportPanel.current === this) ReportPanel.current = undefined;
    });
  }

  static showOrUpdate(_extensionUri: vscode.Uri, report: CodelyReport, title: string, appVersion: string) {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    if (ReportPanel.current) {
      ReportPanel.current.panel.webview.html = renderHtml(report, title, appVersion);
      ReportPanel.current.panel.title = `Codely: ${shortenTitle(title)}`;
      ReportPanel.current.panel.reveal(column, true);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'codelyReport',
      `Codely: ${shortenTitle(title)}`,
      { viewColumn: column, preserveFocus: true },
      { enableScripts: false, retainContextWhenHidden: true },
    );
    panel.webview.html = renderHtml(report, title, appVersion);
    ReportPanel.current = new ReportPanel(panel);
  }

  static dispose() {
    ReportPanel.current?.panel.dispose();
    ReportPanel.current = undefined;
  }
}

function shortenTitle(t: string): string {
  const parts = t.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || t;
}
