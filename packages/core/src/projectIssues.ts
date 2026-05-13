import * as fs from 'fs';
import * as path from 'path';
import { analyzeWithMetrics } from './analyzer';
import { loadConfig, resolveFileSettings } from './config';
import { collectCodelyIssues, type CodelyIssue } from './diagnosticIssues';
import { listProjectSourceFiles, type AnalyzeProjectOptions } from './project';

export interface ProjectFileIssues {
  relativePath: string;
  absolutePath: string;
  issues: CodelyIssue[];
}

export function collectProjectCodelyIssues(dirPath: string, options?: AnalyzeProjectOptions): ProjectFileIssues[] {
  const config = loadConfig(dirPath);
  const out: ProjectFileIssues[] = [];
  for (const file of listProjectSourceFiles(dirPath, options)) {
    const code = fs.readFileSync(file, 'utf8');
    const relPath = path.relative(dirPath, file).split(path.sep).join('/');
    const resolved = resolveFileSettings(relPath, config);
    if (!resolved.diagnostics) continue;

    const ext = path.extname(file).toLowerCase();
    let languageId: string | undefined;
    if (ext === '.vue') languageId = 'vue';
    else if (ext === '.svelte') languageId = 'svelte';
    else if (ext === '.astro') languageId = 'astro';

    const fileConfig = { ...config, thresholds: resolved.thresholds };
    const { metrics } = analyzeWithMetrics(code, {
      filename: path.basename(file),
      languageId,
      config: fileConfig,
    });

    const issues = collectCodelyIssues(metrics, resolved.thresholds, code);
    if (issues.length === 0) continue;
    out.push({ relativePath: relPath, absolutePath: path.resolve(file), issues });
  }
  return out;
}

/** Single file on disk; config loaded from `path.dirname(absoluteFilePath)`. */
export function collectFileCodelyIssues(absoluteFilePath: string): ProjectFileIssues | null {
  const root = path.dirname(absoluteFilePath);
  const config = loadConfig(root);
  const rel = path.relative(root, absoluteFilePath).split(path.sep).join('/') || path.basename(absoluteFilePath);
  const resolved = resolveFileSettings(rel, config);
  if (!resolved.diagnostics) return null;

  const code = fs.readFileSync(absoluteFilePath, 'utf8');
  const ext = path.extname(absoluteFilePath).toLowerCase();
  let languageId: string | undefined;
  if (ext === '.vue') languageId = 'vue';
  else if (ext === '.svelte') languageId = 'svelte';
  else if (ext === '.astro') languageId = 'astro';

  const fileConfig = { ...config, thresholds: resolved.thresholds };
  const { metrics } = analyzeWithMetrics(code, {
    filename: path.basename(absoluteFilePath),
    languageId,
    config: fileConfig,
  });
  const issues = collectCodelyIssues(metrics, resolved.thresholds, code);
  return { relativePath: rel, absolutePath: path.resolve(absoluteFilePath), issues };
}
