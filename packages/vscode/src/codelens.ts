import * as vscode from 'vscode';
import { FunctionMetrics, perFunctionLoadScore } from '@codely/core';
import { getAnalysis, isSupported } from './cache';
import { codelyContextForDocument } from './workspaceContext';

function loadLabel(score: number): string {
  if (score >= 4) return 'HIGH load';
  if (score >= 2) return 'med load';
  return 'low load';
}

function perFunctionTitle(fn: FunctionMetrics): string {
  const score = perFunctionLoadScore(fn);
  const parts: string[] = [`Codely · ${loadLabel(score)}`];
  parts.push(`cyclo ${fn.cyclomatic}`);
  if (fn.maxDepth >= 3) parts.push(`depth ${fn.maxDepth}`);
  if (fn.ternaryDepth >= 2) parts.push(`?: x${fn.ternaryDepth}`);
  if (fn.bitwiseOps >= 3) parts.push(`${fn.bitwiseOps} bitwise`);
  if (fn.loopNesting >= 2) parts.push(`O(n^${fn.loopNesting})`);
  if (fn.lengthLines > 40) parts.push(`${fn.lengthLines}L`);
  if (fn.sideEffects.length > 0)
    parts.push(`${fn.sideEffects.length} side effect${fn.sideEffects.length === 1 ? '' : 's'}`);
  if (fn.detectedPatterns.length > 0) {
    const filtered = fn.detectedPatterns.filter((p) => p !== 'nested-ternary' && p !== 'bitwise-heavy');
    if (filtered.length > 0) parts.push(filtered.slice(0, 2).join('+'));
  }
  return parts.join(' · ');
}

function fileTitle(fatigue: number, readability: number, fnCount: number): string {
  const tag = fatigue >= 7 ? 'HIGH fatigue' : fatigue >= 4 ? 'med fatigue' : 'low fatigue';
  return `Codely · ${tag} ${fatigue}/10 · readability ${readability}/10 · ${fnCount} fn${fnCount === 1 ? '' : 's'} · click for full report`;
}

export class CodelyCodeLensProvider implements vscode.CodeLensProvider {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;

  refresh() {
    this.emitter.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!isSupported(document)) return [];
    const cfg = vscode.workspace.getConfiguration('codely');
    if (cfg.get<boolean>('enableCodeLens', true) === false) return [];

    const { resolved } = codelyContextForDocument(document);
    if (!resolved.codeLens) return [];

    const { report, metrics } = getAnalysis(document);
    const lenses: vscode.CodeLens[] = [];

    const fileRange = new vscode.Range(0, 0, 0, 0);
    lenses.push(
      new vscode.CodeLens(fileRange, {
        title: fileTitle(
          report.code_fatigue_analysis.fatigue_score,
          report.complexity_analysis.readability_score,
          metrics.functions.length,
        ),
        command: 'codely.analyzeFile',
      }),
    );

    const lastLine = Math.max(0, document.lineCount - 1);
    for (const fn of metrics.functions) {
      if (fn.startLine <= 0) continue;
      const line = Math.min(lastLine, fn.startLine - 1);
      const range = new vscode.Range(line, 0, line, 0);
      lenses.push(
        new vscode.CodeLens(range, {
          title: perFunctionTitle(fn),
          command: 'codely.revealFunction',
          arguments: [document.uri, fn.startLine - 1, fn.name, fn.ownerClass],
        }),
      );
    }

    return lenses;
  }
}
