#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { analyze } from './analyzer';

function usage() {
  console.error('Usage: codely <file> [--json]');
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
  const filled = Math.round((score / 10) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();
  const filename = args[0];
  const wantsJson = args.includes('--json');

  if (!fs.existsSync(filename)) {
    console.error(`File not found: ${filename}`);
    process.exit(1);
  }

  const code = fs.readFileSync(filename, 'utf8');
  const abs = path.resolve(filename);
  const ext = path.extname(abs).toLowerCase();
  const languageId =
    ext === '.vue' ? 'vue' : ext === '.svelte' ? 'svelte' : ext === '.astro' ? 'astro' : undefined;
  const report = analyze(code, { filename: path.basename(filename), languageId });

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
  if (report.high_level_flow.length > 10) console.log(paint(`    … +${report.high_level_flow.length - 10} more`, 'gray'));
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
  console.log('    Readability:    ' + paint(bar(report.complexity_analysis.readability_score), 'green') + `  ${report.complexity_analysis.readability_score}/10`);
  console.log('    Maintainability:' + paint(bar(report.complexity_analysis.maintainability_score), 'green') + `  ${report.complexity_analysis.maintainability_score}/10`);
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
}

main();
