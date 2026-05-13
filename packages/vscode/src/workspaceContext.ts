import * as path from 'path';
import * as vscode from 'vscode';
import { loadConfig, resolveFileSettings, type CodelyConfig, type ResolvedFileSettings } from '@codely/core';

export function codelyContextForDocument(document: vscode.TextDocument): {
  root: string;
  relativePathPosix: string;
  config: CodelyConfig;
  resolved: ResolvedFileSettings;
  effectiveConfig: CodelyConfig;
} {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  const root = folder?.uri.fsPath ?? path.dirname(document.fileName);
  const config = loadConfig(root);
  const relBase = folder ? root : path.dirname(document.fileName);
  const relativePathPosix =
    path.relative(relBase, document.fileName).split(path.sep).join('/') || path.basename(document.fileName);
  const resolved = resolveFileSettings(relativePathPosix, config);
  const effectiveConfig: CodelyConfig = {
    ...config,
    thresholds: {
      cyclomatic: resolved.thresholds.cyclomatic,
      maxDepth: resolved.thresholds.maxDepth,
      functionLength: resolved.thresholds.functionLength,
      fatigueScore: resolved.thresholds.fatigueScore,
    },
  };
  return { root, relativePathPosix, config, resolved, effectiveConfig };
}
