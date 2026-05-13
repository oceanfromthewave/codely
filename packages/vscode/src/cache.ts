import * as vscode from 'vscode';
import { analyzeWithMetrics, AnalyzeFullResult, AnalyzeOptions, SupportedLanguage } from '@codely/core';
import type { AnalysisMode } from '@codely/core';
import { analyzeNativeWithMetrics, NATIVE_LANGUAGE_IDS } from './nativeAnalysis';
import { codelyContextForDocument } from './workspaceContext';

interface CacheEntry {
  version: number;
  result: AnalyzeFullResult;
}

const cache = new Map<string, CacheEntry>();

const JS_FAMILY = new Set(['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'vue', 'svelte', 'astro']);

const SUPPORTED = new Set<string>([...JS_FAMILY, ...NATIVE_LANGUAGE_IDS]);

function languageFromDocument(document: vscode.TextDocument): SupportedLanguage | undefined {
  switch (document.languageId) {
    case 'typescript':
      return 'typescript';
    case 'typescriptreact':
      return 'tsx';
    case 'javascript':
      return 'javascript';
    case 'javascriptreact':
      return 'jsx';
    case 'vue':
    case 'svelte':
    case 'astro':
      return undefined;
    default:
      return undefined;
  }
}

function normalizeMode(raw: string): AnalysisMode {
  if (raw === 'deep' || raw === 'refactor' || raw === 'architect' || raw === 'standard') return raw;
  return 'standard';
}

/** Options derived from workspace settings and the document (language id, path). */
export function analyzeOptionsForDocument(document: vscode.TextDocument, filenameOverride?: string): AnalyzeOptions {
  const cfg = vscode.workspace.getConfiguration('codely');
  const mode = normalizeMode(cfg.get<string>('mode', 'standard'));
  return {
    filename: filenameOverride ?? document.fileName,
    language: languageFromDocument(document),
    languageId: document.languageId,
    mode,
  };
}

export function isSupported(document: vscode.TextDocument): boolean {
  return SUPPORTED.has(document.languageId);
}

export function getAnalysis(document: vscode.TextDocument): AnalyzeFullResult {
  const key = document.uri.toString();
  const cached = cache.get(key);
  if (cached && cached.version === document.version) return cached.result;

  const cfg = vscode.workspace.getConfiguration('codely');
  const mode = normalizeMode(cfg.get<string>('mode', 'standard'));
  const locale = cfg.get<string>('language', 'en');

  const { effectiveConfig } = codelyContextForDocument(document);

  let result: AnalyzeFullResult;
  if (NATIVE_LANGUAGE_IDS.has(document.languageId)) {
    result = analyzeNativeWithMetrics(document.getText(), document.languageId, document.fileName, mode);
  } else {
    result = analyzeWithMetrics(document.getText(), {
      ...analyzeOptionsForDocument(document),
      config: effectiveConfig,
      locale,
    });
  }

  cache.set(key, { version: document.version, result });
  return result;
}

export function invalidate(document: vscode.TextDocument) {
  cache.delete(document.uri.toString());
}

export function clearAll() {
  cache.clear();
}
