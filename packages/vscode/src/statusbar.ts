import * as vscode from 'vscode';
import { getAnalysis, isSupported } from './cache';

let item: vscode.StatusBarItem | undefined;

export function setupStatusBar(context: vscode.ExtensionContext): () => void {
  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'codely.analyzeFile';
  context.subscriptions.push(item);
  refreshStatusBar();
  return refreshStatusBar;
}

export function refreshStatusBar() {
  if (!item) return;
  const cfg = vscode.workspace.getConfiguration('codely');
  if (cfg.get<boolean>('enableStatusBar', true) === false) {
    item.hide();
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor || !isSupported(editor.document)) {
    item.hide();
    return;
  }
  try {
    const { report, metrics } = getAnalysis(editor.document);
    const f = report.code_fatigue_analysis.fatigue_score;
    const r = report.complexity_analysis.readability_score;
    const icon = f >= 7 ? '$(error)' : f >= 4 ? '$(warning)' : '$(check)';
    item.text = `${icon} Codely ${f}/10`;
    item.tooltip = new vscode.MarkdownString(
      [
        `**Codely**`,
        ``,
        `Fatigue: **${f}/10**`,
        `Readability: **${r}/10**`,
        `Maintainability: **${report.complexity_analysis.maintainability_score}/10**`,
        ``,
        `${metrics.functions.length} function${metrics.functions.length === 1 ? '' : 's'} · ${metrics.classes.length} class${metrics.classes.length === 1 ? '' : 'es'}`,
        ``,
        `Click to open full report.`,
      ].join('\n'),
    );
    item.show();
  } catch {
    item.hide();
  }
}
