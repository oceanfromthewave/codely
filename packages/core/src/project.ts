import * as fs from 'fs';
import * as path from 'path';
import { analyzeWithMetrics, perFunctionLoadScore } from './analyzer';
import { FileMetrics, FunctionMetrics, CodelyReport, ProjectHistory, CodelyConfig } from './schema';
import { loadConfig } from './config';

export interface ProjectHotspot {
  file: string;
  name: string;
  score: number;
  cyclomatic: number;
  length: number;
  line: number;
}

export interface ProjectSummary {
  totalFiles: number;
  totalLines: number;
  totalFunctions: number;
  averageReadability: number;
  averageMaintainability: number;
  hotspots: ProjectHotspot[];
  fileScores: { file: string; fatigue: number; delta?: number }[];
  historyPath?: string;
}

const SUPPORTED_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx',
  '.vue', '.svelte', '.astro',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.java', '.kt', '.scala', '.groovy', '.m', '.mm'
]);

export function analyzeProject(dirPath: string): ProjectSummary {
  const config = loadConfig(dirPath);
  const ignoreDirs = new Set(config.exclude || ['node_modules', 'dist', 'build', '.git']);
  
  const files = getAllFiles(dirPath, [], ignoreDirs);
  let totalLines = 0;
  let totalFunctions = 0;
  let sumReadability = 0;
  let sumMaintainability = 0;
  let analyzedCount = 0;

  const allFunctions: ProjectHotspot[] = [];
  const fileScores: { file: string; fatigue: number; delta?: number }[] = [];

  const history = loadHistory(dirPath);
  const newHistory: ProjectHistory = {
    lastAnalyzed: new Date().toISOString(),
    files: {}
  };

  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    const relPath = path.relative(dirPath, file);
    const ext = path.extname(file).toLowerCase();
    
    let languageId: string | undefined;
    if (ext === '.vue') languageId = 'vue';
    else if (ext === '.svelte') languageId = 'svelte';
    else if (ext === '.astro') languageId = 'astro';

    const { report, metrics } = analyzeWithMetrics(code, { 
      filename: path.basename(file), 
      languageId,
      config
    });

    if (metrics.totalLines > 0) {
      analyzedCount++;
      totalLines += metrics.nonBlankLines;
      totalFunctions += metrics.functions.length;
      sumReadability += report.complexity_analysis.readability_score;
      sumMaintainability += report.complexity_analysis.maintainability_score;
      
      let delta: number | undefined;
      if (history.files[relPath]) {
        delta = report.code_fatigue_analysis.fatigue_score - history.files[relPath].fatigue;
      }

      fileScores.push({ file: relPath, fatigue: report.code_fatigue_analysis.fatigue_score, delta });

      newHistory.files[relPath] = {
        fatigue: report.code_fatigue_analysis.fatigue_score,
        readability: report.complexity_analysis.readability_score,
        maintainability: report.complexity_analysis.maintainability_score,
        timestamp: newHistory.lastAnalyzed
      };

      for (const fn of metrics.functions) {
        allFunctions.push({
          file: relPath,
          name: fn.name,
          score: perFunctionLoadScore(fn),
          cyclomatic: fn.cyclomatic,
          length: fn.lengthLines,
          line: fn.startLine
        });
      }
    }
  }

  if (config.history?.enabled) {
    saveHistory(dirPath, newHistory);
  }

  const hotspots = allFunctions
    .sort((a, b) => b.score - a.score || b.cyclomatic - a.cyclomatic)
    .slice(0, 10);

  return {
    totalFiles: files.length,
    totalLines,
    totalFunctions,
    averageReadability: analyzedCount ? sumReadability / analyzedCount : 0,
    averageMaintainability: analyzedCount ? sumMaintainability / analyzedCount : 0,
    hotspots,
    fileScores: fileScores.sort((a, b) => b.fatigue - a.fatigue).slice(0, 10)
  };
}

function getAllFiles(dir: string, fileList: string[], ignoreDirs: Set<string>): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      if (!ignoreDirs.has(file)) {
        getAllFiles(name, fileList, ignoreDirs);
      }
    } else {
      const ext = path.extname(file).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        fileList.push(name);
      }
    }
  }
  return fileList;
}

function loadHistory(rootPath: string): ProjectHistory {
  const historyPath = path.join(rootPath, '.codely', 'history.json');
  if (fs.existsSync(historyPath)) {
    try {
      return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch (e) {}
  }
  return { lastAnalyzed: '', files: {} };
}

function saveHistory(rootPath: string, history: ProjectHistory) {
  const dir = path.join(rootPath, '.codely');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'history.json'), JSON.stringify(history, null, 2));
}
