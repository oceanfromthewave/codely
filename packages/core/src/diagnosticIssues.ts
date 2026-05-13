import type { FileMetrics } from './schema';
import type { ResolvedFileSettings } from './config';
import { isFileWideSuppressed, suppressedLinesForDiagnostics } from './suppress';

/** SARIF-style columns: 1-based inclusive start, 1-based exclusive end (see SARIF region). */
export interface CodelyIssue {
  ruleId: string;
  /** Maps to VS Code DiagnosticSeverity and SARIF level. */
  vscodeSeverity: 'warning' | 'information' | 'hint';
  message: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

function lineColumns1Based(source: string, line1: number): { startColumn: number; endColumn: number } {
  const lines = source.split(/\r?\n/);
  const idx = line1 - 1;
  if (idx < 0 || idx >= lines.length) return { startColumn: 1, endColumn: 2 };
  const line = lines[idx];
  const m = line.match(/\S/);
  const startColumn = m ? m.index! + 1 : 1;
  const endColumn = line.length + 1;
  return { startColumn, endColumn };
}

type Thresholds = ResolvedFileSettings['thresholds'];

/**
 * Same rules as the VS Code diagnostics provider: thresholds from `.codelyrc` / resolved settings,
 * plus `codely-disable-*` inline directives.
 */
export function collectCodelyIssues(metrics: FileMetrics, t: Thresholds, source: string): CodelyIssue[] {
  if (isFileWideSuppressed(source)) return [];
  const suppressedLines = suppressedLinesForDiagnostics(source);
  const issues: CodelyIssue[] = [];

  const push = (line1: number, ruleId: string, vscodeSeverity: CodelyIssue['vscodeSeverity'], message: string) => {
    if (suppressedLines.has(line1)) return;
    const { startColumn, endColumn } = lineColumns1Based(source, line1);
    issues.push({
      ruleId,
      vscodeSeverity,
      message,
      startLine: line1,
      endLine: line1,
      startColumn,
      endColumn,
    });
  };

  for (const fn of metrics.functions) {
    if (fn.startLine <= 0) continue;
    const line1 = fn.startLine;
    const label = fn.ownerClass ? `${fn.ownerClass}.${fn.name}` : fn.name;

    if (fn.cyclomatic >= t.cyclomatic + 5) {
      push(
        line1,
        'codely/cyclomatic-very-high',
        'warning',
        `Codely: ${label} has very high cyclomatic complexity (${fn.cyclomatic}). Too many branches in one function.`,
      );
    } else if (fn.cyclomatic >= t.cyclomatic) {
      push(
        line1,
        'codely/cyclomatic-high',
        'information',
        `Codely: ${label} has high cyclomatic complexity (${fn.cyclomatic}). Consider splitting.`,
      );
    }

    if (fn.maxDepth >= t.maxDepth + 1) {
      push(
        line1,
        'codely/nesting-deep',
        'warning',
        `Codely: ${label} is nested ${fn.maxDepth} levels deep. Use early returns / guard clauses to flatten.`,
      );
    } else if (fn.maxDepth >= t.maxDepth) {
      push(line1, 'codely/nesting', 'information', `Codely: ${label} reaches nesting depth ${fn.maxDepth}.`);
    }

    if (fn.loopNesting >= 2) {
      push(
        line1,
        'codely/nested-loops',
        'information',
        `Codely: ${label} has nested loops (depth ${fn.loopNesting}) → potential O(n^${fn.loopNesting}) hotspot if both bounds scale with input.`,
      );
    }

    if (fn.ternaryDepth >= 4) {
      push(
        line1,
        'codely/nested-ternary-warning',
        'warning',
        `Codely: ${label} has nested ternaries depth ${fn.ternaryDepth}. Convert to if/else; \`?:\` chains hide control flow.`,
      );
    } else if (fn.ternaryDepth >= 3) {
      push(
        line1,
        'codely/nested-ternary',
        'information',
        `Codely: ${label} has nested ternaries depth ${fn.ternaryDepth}.`,
      );
    }

    if (fn.bitwiseOps >= 8) {
      push(
        line1,
        'codely/bitwise-heavy',
        'information',
        `Codely: ${label} has ${fn.bitwiseOps} bitwise operations. If intentional, document the trick; otherwise replace with named arithmetic.`,
      );
    } else if (fn.bitwiseOps >= 5) {
      push(
        line1,
        'codely/bitwise',
        'hint',
        `Codely: ${label} has ${fn.bitwiseOps} bitwise operations. Consider naming intermediate values.`,
      );
    }

    const longFn = Math.max(60, t.functionLength + 20);
    if (fn.lengthLines > longFn) {
      push(
        line1,
        'codely/long-function',
        'hint',
        `Codely: ${label} is ${fn.lengthLines} lines. Likely doing more than one thing.`,
      );
    }

    if (fn.sideEffects.length >= 3) {
      push(
        line1,
        'codely/many-side-effects',
        'hint',
        `Codely: ${label} has ${fn.sideEffects.length} side effects (${fn.sideEffects.slice(0, 3).join(', ')}). Hard to test in isolation.`,
      );
    }
  }

  if (metrics.globalAssignments.length > 0 && !suppressedLines.has(1)) {
    issues.push({
      ruleId: 'codely/top-level-mutation',
      vscodeSeverity: 'hint',
      message: `Codely: top-level mutations detected (${metrics.globalAssignments.slice(0, 4).join(', ')}). Globals reduce locality of reasoning.`,
      startLine: 1,
      endLine: 1,
      startColumn: 1,
      endColumn: 2,
    });
  }

  return issues;
}
