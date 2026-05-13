import * as vscode from 'vscode';
import { collectCodelyIssues, type CodelyIssue } from '@codely/core';
import { getAnalysis, isSupported } from './cache';
import { codelyContextForDocument } from './workspaceContext';

const collection = vscode.languages.createDiagnosticCollection('codely');

export function getCollection() {
  return collection;
}

export function clear(uri: vscode.Uri) {
  collection.delete(uri);
}

function vscodeSeverity(s: CodelyIssue['vscodeSeverity']): vscode.DiagnosticSeverity {
  switch (s) {
    case 'warning':
      return vscode.DiagnosticSeverity.Warning;
    case 'information':
      return vscode.DiagnosticSeverity.Information;
    default:
      return vscode.DiagnosticSeverity.Hint;
  }
}

function issueToRange(document: vscode.TextDocument, issue: CodelyIssue): vscode.Range {
  const sl = Math.min(Math.max(0, issue.startLine - 1), document.lineCount - 1);
  const el = Math.min(Math.max(0, issue.endLine - 1), document.lineCount - 1);
  const sc = Math.max(0, issue.startColumn - 1);
  const ec = Math.max(sc, issue.endColumn - 1);
  return new vscode.Range(sl, sc, el, ec);
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

  const { resolved } = codelyContextForDocument(document);
  if (!resolved.diagnostics) {
    collection.delete(document.uri);
    return;
  }

  const text = document.getText();
  const { metrics } = getAnalysis(document);
  const issues = collectCodelyIssues(metrics, resolved.thresholds, text);
  const diags: vscode.Diagnostic[] = issues.map((issue) => {
    const d = new vscode.Diagnostic(issueToRange(document, issue), issue.message, vscodeSeverity(issue.vscodeSeverity));
    d.source = 'codely';
    d.code = issue.ruleId;
    return d;
  });

  collection.set(document.uri, diags);
}
