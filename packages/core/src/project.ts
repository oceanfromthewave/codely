import * as fs from 'fs';
import * as path from 'path';
import { analyzeWithMetrics, perFunctionLoadScore } from './analyzer';
import { FileMetrics, FunctionMetrics, CodelyReport } from './schema';

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
  fileScores: { file: string; fatigue: number }[];
}

const SUPPORTED_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx',
  '.vue', '.svelte', '.astro',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.java', '.kt', '.scala', '.groovy', '.m', '.mm'
]);

const IGNORE_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.vscode', 'coverage']);

export function analyzeProject(dirPath: string): ProjectSummary {
  const files = getAllFiles(dirPath);
  let totalLines = 0;
  let totalFunctions = 0;
  let sumReadability = 0;
  let sumMaintainability = 0;
  let analyzedCount = 0;

  const allFunctions: ProjectHotspot[] = [];
  const fileScores: { file: string; fatigue: number }[] = [];

  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    const relPath = path.relative(dirPath, file);
    const ext = path.extname(file).toLowerCase();
    
    // Simple mapping for embedded languages
    let languageId: string | undefined;
    if (ext === '.vue') languageId = 'vue';
    else if (ext === '.svelte') languageId = 'svelte';
    else if (ext === '.astro') languageId = 'astro';

    // Note: analyzeWithMetrics in analyzer.ts handles both JS/TS (Babel) and Native (Heuristic) 
    // IF we are in the VS Code extension. However, core's analyzer.ts only has JS/TS logic.
    // The native heuristic is in packages/vscode/src/nativeAnalysis.ts.
    // We should probably move nativeAnalysis.ts to core if we want the CLI to support it.
    
    const { report, metrics } = analyzeWithMetrics(code, { 
      filename: path.basename(file), 
      languageId 
    });

    if (metrics.totalLines > 0) {
      analyzedCount++;
      totalLines += metrics.nonBlankLines;
      totalFunctions += metrics.functions.length;
      sumReadability += report.complexity_analysis.readability_score;
      sumMaintainability += report.complexity_analysis.maintainability_score;
      
      fileScores.push({ file: relPath, fatigue: report.code_fatigue_analysis.fatigue_score });

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

function getAllFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      if (!IGNORE_DIRS.has(file)) {
        getAllFiles(name, fileList);
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
