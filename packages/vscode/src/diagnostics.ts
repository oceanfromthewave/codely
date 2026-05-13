import * as vscode from 'vscode';
import { getAnalysis, isSupported } from './cache';

const collection = vscode.languages.createDiagnosticCollection('codely');

export function getCollection() {
  return collection;
}

export function clear(uri: vscode.Uri) {
  collection.delete(uri);
}

export function refreshDiagnostics(document: vscode.TextDocument) {
  if (!isSupported(document)) {
    collection.delete(document.uri);
    return;
  }
  const cfg = vscode.workspace.getConfiguration('codely');
  if (cfg.get<boolean>('enableDiagnostics', true) === false) {
    collection.delete(document.uri);
    return;
  }

  const { metrics } = getAnalysis(document);
  const diags: vscode.Diagnostic[] = [];

  const rangeForLine = (lineNo: number): vscode.Range => {
    const safe = Math.min(Math.max(0, lineNo), document.lineCount - 1);
    const text = document.lineAt(safe);
    return new vscode.Range(safe, text.firstNonWhitespaceCharacterIndex, safe, text.text.length);
  };

  for (const fn of metrics.functions) {
    if (fn.startLine <= 0) continue;
    const range = rangeForLine(fn.startLine - 1);
    const label = fn.ownerClass ? `${fn.ownerClass}.${fn.name}` : fn.name;

    if (fn.cyclomatic >= 15) {
      diags.push(diag(range, `Codely: ${label} has very high cyclomatic complexity (${fn.cyclomatic}). Too many branches in one function.`, vscode.DiagnosticSeverity.Warning));
    } else if (fn.cyclomatic >= 10) {
      diags.push(diag(range, `Codely: ${label} has high cyclomatic complexity (${fn.cyclomatic}). Consider splitting.`, vscode.DiagnosticSeverity.Information));
    }

    if (fn.maxDepth >= 5) {
      diags.push(diag(range, `Codely: ${label} is nested ${fn.maxDepth} levels deep. Use early returns / guard clauses to flatten.`, vscode.DiagnosticSeverity.Warning));
    } else if (fn.maxDepth >= 4) {
      diags.push(diag(range, `Codely: ${label} reaches nesting depth ${fn.maxDepth}.`, vscode.DiagnosticSeverity.Information));
    }

    if (fn.loopNesting >= 2) {
      diags.push(diag(range, `Codely: ${label} has nested loops (depth ${fn.loopNesting}) → potential O(n^${fn.loopNesting}) hotspot if both bounds scale with input.`, vscode.DiagnosticSeverity.Information));
    }

    if (fn.ternaryDepth >= 4) {
      diags.push(diag(range, `Codely: ${label} has nested ternaries depth ${fn.ternaryDepth}. Convert to if/else; \`?:\` chains hide control flow.`, vscode.DiagnosticSeverity.Warning));
    } else if (fn.ternaryDepth >= 3) {
      diags.push(diag(range, `Codely: ${label} has nested ternaries depth ${fn.ternaryDepth}.`, vscode.DiagnosticSeverity.Information));
    }

    if (fn.bitwiseOps >= 8) {
      diags.push(diag(range, `Codely: ${label} has ${fn.bitwiseOps} bitwise operations. If intentional, document the trick; otherwise replace with named arithmetic.`, vscode.DiagnosticSeverity.Information));
    } else if (fn.bitwiseOps >= 5) {
      diags.push(diag(range, `Codely: ${label} has ${fn.bitwiseOps} bitwise operations. Consider naming intermediate values.`, vscode.DiagnosticSeverity.Hint));
    }

    if (fn.lengthLines > 60) {
      diags.push(diag(range, `Codely: ${label} is ${fn.lengthLines} lines. Likely doing more than one thing.`, vscode.DiagnosticSeverity.Hint));
    }

    if (fn.sideEffects.length >= 3) {
      diags.push(diag(range, `Codely: ${label} has ${fn.sideEffects.length} side effects (${fn.sideEffects.slice(0, 3).join(', ')}). Hard to test in isolation.`, vscode.DiagnosticSeverity.Hint));
    }
  }

  if (metrics.globalAssignments.length > 0) {
    const r = new vscode.Range(0, 0, 0, 0);
    diags.push(diag(r, `Codely: top-level mutations detected (${metrics.globalAssignments.slice(0, 4).join(', ')}). Globals reduce locality of reasoning.`, vscode.DiagnosticSeverity.Hint));
  }

  collection.set(document.uri, diags);
}

function diag(range: vscode.Range, message: string, severity: vscode.DiagnosticSeverity): vscode.Diagnostic {
  const d = new vscode.Diagnostic(range, message, severity);
  d.source = 'codely';
  return d;
}
