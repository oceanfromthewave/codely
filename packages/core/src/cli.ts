#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { analyzeWithMetrics } from './analyzer';
import { analyzeProject, type ProjectSummary } from './project';
import { listGitChangedFiles } from './gitChanged';
import { generateHtmlReport } from './translate';
import { loadConfig } from './config';
import { fixMagicNumbers } from './fixer';

function usage() {
  console.error(
    'Usage: codely <file_or_directory> [--json] [--html <out.html>] [--fix] [--git-base <ref>]\n' +
      '  --git-base <ref>  (directory only) Restrict analysis to files changed vs <ref> (git working tree + staged).',
  );
  process.exit(2);
}

function paint(s: string, color: 'red' | 'yellow' | 'green' | 'cyan' | 'gray' | 'bold'): string {
  const codes: Record<string, string> = {
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    bold: '\x1b[1m',
  };
  const reset = '\x1b[0m';
  return `${codes[color]}${s}${reset}`;
}

function bar(score: number, width = 10): string {
  const filled = Math.min(width, Math.max(0, Math.round((score / 10) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function printProjectSummary(summary: ProjectSummary) {
  console.log();
  console.log(paint('  Codely Project Summary  ', 'bold'));
  console.log(paint('  ────────────────────────────────────────', 'gray'));
  console.log(`  Files:           ${summary.totalFiles}`);
  console.log(`  Lines of Code:   ${summary.totalLines}`);
  console.log(`  Total Functions: ${summary.totalFunctions}`);
  console.log(`  Avg Readability: ${summary.averageReadability.toFixed(1)}/10`);
  console.log(`  Avg Maintainability: ${summary.averageMaintainability.toFixed(1)}/10`);
  console.log();

  console.log(paint('  Top 10 Hotspots (Most Complex Functions)', 'bold'));
  for (const h of summary.hotspots) {
    const color = h.score >= 7 ? 'red' : h.score >= 4 ? 'yellow' : 'cyan';
    console.log(
      `    ${paint(bar(h.score, 5), color)} ${paint(h.name, 'bold')} ${paint('(' + h.file + ':' + h.line + ')', 'gray')}`,
    );
    console.log(`      Score: ${h.score}, Cyclomatic: ${h.cyclomatic}, Lines: ${h.length}`);
  }
  console.log();

  console.log(paint('  Files with Highest Fatigue', 'bold'));
  for (const f of summary.fileScores) {
    const color = f.fatigue >= 7 ? 'red' : f.fatigue >= 4 ? 'yellow' : 'green';
    let deltaStr = '';
    if (f.delta !== undefined && f.delta !== 0) {
      const dColor = f.delta > 0 ? 'red' : 'green';
      deltaStr = paint(` (${f.delta > 0 ? '+' : ''}${f.delta.toFixed(1)})`, dColor);
    }
    console.log(`    ${paint(bar(f.fatigue, 5), color)} ${f.fatigue}/10${deltaStr} - ${f.file}`);
  }
  console.log();
}

async function ask(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(paint(`  ? ${question} (y/N): `, 'cyan'), (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function main() {
  const rawArgs = process.argv.slice(2);
  let gitBase: string | undefined;
  const args: string[] = [];
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--git-base') {
      gitBase = rawArgs[++i];
      if (!gitBase) usage();
      continue;
    }
    args.push(rawArgs[i]);
  }
  if (args.length === 0) usage();
  const inputPath = args[0];
  const wantsJson = args.includes('--json');
  const wantsFix = args.includes('--fix');
  const htmlIdx = args.indexOf('--html');
  const htmlPath = htmlIdx >= 0 ? args[htmlIdx + 1] : undefined;

  if (!fs.existsSync(inputPath)) {
    console.error(`Path not found: ${inputPath}`);
    process.exit(1);
  }

  const rootDir = fs.statSync(inputPath).isDirectory() ? inputPath : path.dirname(inputPath);
  const config = loadConfig(rootDir);

  const stats = fs.statSync(inputPath);
  if (stats.isDirectory()) {
    let summary: ProjectSummary;
    if (gitBase) {
      const rels = listGitChangedFiles(inputPath, gitBase);
      if (rels === null) {
        console.error('Could not list changed files (git error or not a repository).');
        process.exit(1);
      }
      if (rels.length === 0) {
        console.log(`No changed files vs ${gitBase}.`);
        summary = {
          totalFiles: 0,
          totalLines: 0,
          totalFunctions: 0,
          averageReadability: 0,
          averageMaintainability: 0,
          hotspots: [],
          fileScores: [],
        };
      } else {
        summary = analyzeProject(inputPath, { onlyRelativePaths: new Set(rels) });
      }
    } else {
      summary = analyzeProject(inputPath);
    }
    if (wantsJson) {
      process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    } else {
      printProjectSummary(summary);
    }
    return;
  }

  const filename = inputPath;
  const code = fs.readFileSync(filename, 'utf8');
  const abs = path.resolve(filename);
  const ext = path.extname(abs).toLowerCase();
  const languageId = ext === '.vue' ? 'vue' : ext === '.svelte' ? 'svelte' : ext === '.astro' ? 'astro' : undefined;

  const { report, metrics } = analyzeWithMetrics(code, {
    filename: path.basename(filename),
    languageId,
    config,
  });

  if (htmlPath) {
    const html = generateHtmlReport(report, filename);
    fs.writeFileSync(htmlPath, html);
    console.log(`Report saved to ${htmlPath}`);
    return;
  }

  if (wantsJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  console.log();
  console.log(paint('  Codely  ', 'bold') + paint('— Code Understanding Engine v0.1', 'gray'));
  console.log(paint('  ────────────────────────────────────────', 'gray'));
  console.log(paint('  File:', 'gray') + ' ' + filename);
  console.log();
  console.log(paint('  Summary', 'bold'));
  console.log('    ' + report.summary);
  console.log();
  console.log(paint('  Intent', 'bold'));
  console.log('    ' + report.intent);
  console.log();
  console.log(paint('  High-level flow', 'bold'));
  for (const s of report.high_level_flow.slice(0, 10)) console.log('    • ' + s);
  if (report.high_level_flow.length > 10)
    console.log(paint(`    … +${report.high_level_flow.length - 10} more`, 'gray'));
  console.log();
  console.log(paint('  Structure', 'bold'));
  for (const p of report.structure_breakdown.slice(0, 6)) {
    console.log('    ' + paint(p.part, 'cyan'));
    console.log('      ' + paint('why: ', 'gray') + p.responsibility);
    console.log('      ' + paint('how: ', 'gray') + p.logic);
  }
  console.log();
  console.log(paint('  Data flow', 'bold'));
  for (const s of report.data_flow) console.log('    → ' + s);
  console.log();
  console.log(paint('  Complexity', 'bold'));
  console.log('    Time:           ' + report.complexity_analysis.time_complexity_estimate);
  console.log(
    '    Readability:    ' +
      paint(bar(report.complexity_analysis.readability_score), 'green') +
      `  ${report.complexity_analysis.readability_score}/10`,
  );
  console.log(
    '    Maintainability:' +
      paint(bar(report.complexity_analysis.maintainability_score), 'green') +
      `  ${report.complexity_analysis.maintainability_score}/10`,
  );
  console.log();
  const fScore = report.code_fatigue_analysis.fatigue_score;
  const fColor = fScore >= 7 ? 'red' : fScore >= 4 ? 'yellow' : 'green';
  console.log(paint('  Code Fatigue', 'bold'));
  console.log('    Score:          ' + paint(bar(fScore), fColor) + `  ${fScore}/10`);
  for (const r of report.code_fatigue_analysis.fatigue_reason) console.log('    ! ' + r);
  if (report.code_fatigue_analysis.risk_points.length > 0) {
    console.log();
    console.log('    ' + paint('Risk points:', 'yellow'));
    for (const r of report.code_fatigue_analysis.risk_points.slice(0, 8)) console.log('      ▸ ' + r);
  }
  console.log();
  console.log(paint('  Refactor suggestions', 'bold'));
  for (const r of report.refactoring_suggestions) console.log('    ✓ ' + r);
  console.log();
  console.log(paint('  Human translation', 'bold'));
  console.log('    ' + report.human_translation);
  console.log();

  if (wantsFix && metrics.magicNumbers > 0) {
    const shouldFix = await ask(`Found ${metrics.magicNumbers} magic numbers. Extract to constants?`);
    if (shouldFix) {
      const fixedCode = fixMagicNumbers(code);
      fs.writeFileSync(filename, fixedCode);
      console.log(paint('    ✓ Fixed magic numbers and updated file.', 'green'));
    }
  }
}

main();
