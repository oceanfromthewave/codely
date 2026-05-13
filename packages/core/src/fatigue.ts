import { FileMetrics, FunctionMetrics } from './schema';

function clamp(n: number, lo = 0, hi = 10): number {
  return Math.max(lo, Math.min(hi, n));
}

export interface FatigueResult {
  score: number;
  reasons: string[];
  risks: string[];
}

export function computeFatigue(metrics: FileMetrics): FatigueResult {
  const reasons: string[] = [];
  const risks: string[] = [];
  let score = 0;

  const fns = metrics.functions;
  const maxDepth = fns.reduce((m, f) => Math.max(m, f.maxDepth), 0);
  const maxCyclo = fns.reduce((m, f) => Math.max(m, f.cyclomatic), 0);
  const maxTernary = fns.reduce((m, f) => Math.max(m, f.ternaryDepth), 0);
  const maxBitwise = fns.reduce((m, f) => Math.max(m, f.bitwiseOps), 0);
  const longFns = fns.filter((f) => f.lengthLines > 40);
  const branchy = fns.filter((f) => f.cyclomatic >= 8);
  const deeplyNested = fns.filter((f) => f.maxDepth >= 4);
  const ternaryHeavy = fns.filter((f) => f.ternaryDepth >= 3);
  const bitwiseHeavy = fns.filter((f) => f.bitwiseOps >= 5);
  const sideEffectHeavy = fns.filter((f) => f.sideEffects.length >= 2);
  const awaitChains = fns.filter((f) => f.hasAwait && f.cyclomatic >= 4);

  if (maxDepth >= 5) {
    score += 3;
    reasons.push(`Nesting reaches depth ${maxDepth} — readers must hold many open conditions in their head.`);
  } else if (maxDepth >= 4) {
    score += 2;
    reasons.push(`Nesting reaches depth ${maxDepth}. Consider early returns or guard clauses.`);
  } else if (maxDepth >= 3) {
    score += 1;
  }

  if (maxTernary >= 4) {
    score += 3;
    reasons.push(
      `Nested ternaries reach depth ${maxTernary} — chained \`?:\` expressions force readers to mentally walk every branch.`,
    );
  } else if (maxTernary >= 3) {
    score += 2;
    reasons.push(
      `Nested ternaries (depth ${maxTernary}) compress branching into expression form — harder to scan than equivalent if/else.`,
    );
  } else if (maxTernary >= 2) {
    score += 1;
  }

  if (maxBitwise >= 8) {
    score += 2;
    reasons.push(
      `Bitwise-heavy code (${maxBitwise} ops in a single function) — operators like \`<< >> & ^\` compress meaning; readers must reverse-engineer the intent.`,
    );
  } else if (maxBitwise >= 5) {
    score += 1;
    reasons.push(
      `Bitwise tricks detected (${maxBitwise} ops) — likely clever optimizations that need a comment explaining the *why*.`,
    );
  }

  if (maxCyclo >= 15) {
    score += 3;
    reasons.push(`At least one function has cyclomatic complexity ${maxCyclo} — too many branches in one place.`);
  } else if (maxCyclo >= 10) {
    score += 2;
    reasons.push(`Highest cyclomatic complexity is ${maxCyclo}; verify the function isn't doing too many things.`);
  } else if (maxCyclo >= 6) {
    score += 1;
  }

  if (longFns.length > 0) {
    score += Math.min(2, longFns.length);
    reasons.push(
      `${longFns.length} function${longFns.length === 1 ? '' : 's'} exceed 40 lines (${longFns
        .map((f) => f.name)
        .slice(0, 3)
        .join(', ')}).`,
    );
  }

  if (metrics.poorlyNamedIdentifiers.length >= 3) {
    score += 2;
    reasons.push(`Ambiguous identifiers in use: ${metrics.poorlyNamedIdentifiers.slice(0, 5).join(', ')}.`);
  } else if (metrics.poorlyNamedIdentifiers.length > 0) {
    score += 1;
  }

  if (sideEffectHeavy.length > 0) {
    score += 1;
    reasons.push(
      `Side effects scattered across ${sideEffectHeavy.length} function${sideEffectHeavy.length === 1 ? '' : 's'} — harder to test in isolation.`,
    );
  }

  if (metrics.globalAssignments.length > 0) {
    score += 1;
    reasons.push(
      `Top-level mutations: ${metrics.globalAssignments.slice(0, 3).join(', ')}. Globals reduce locality of reasoning.`,
    );
  }

  if (metrics.todoComments.length >= 2) {
    score += 1;
    reasons.push(`${metrics.todoComments.length} unresolved TODO/FIXME comments.`);
  }

  if (metrics.commentLines === 0 && metrics.nonBlankLines > 80) {
    score += 1;
    reasons.push('Substantial file with no comments — intent must be inferred entirely from code.');
  }

  for (const f of deeplyNested) {
    risks.push(`${functionLabel(f)} L${f.startLine}-${f.endLine}: nesting depth ${f.maxDepth}.`);
  }
  for (const f of branchy) {
    risks.push(`${functionLabel(f)} L${f.startLine}-${f.endLine}: ${f.cyclomatic} decision points.`);
  }
  for (const f of fns.filter((x) => x.loopNesting >= 2)) {
    risks.push(
      `${functionLabel(f)} L${f.startLine}-${f.endLine}: nested loops (depth ${f.loopNesting}) — potential O(n²)+ hotspot.`,
    );
  }
  for (const f of awaitChains) {
    risks.push(
      `${functionLabel(f)} L${f.startLine}-${f.endLine}: branching async flow — watch for unhandled rejections and ordering bugs.`,
    );
  }
  for (const f of fns.filter((x) => x.sideEffects.length >= 3)) {
    risks.push(`${functionLabel(f)}: ${f.sideEffects.length} side effects (${f.sideEffects.slice(0, 3).join(', ')}).`);
  }
  for (const f of ternaryHeavy) {
    risks.push(
      `${functionLabel(f)} L${f.startLine}-${f.endLine}: nested ternary depth ${f.ternaryDepth} — replace with if/else or named helpers.`,
    );
  }
  for (const f of bitwiseHeavy) {
    risks.push(
      `${functionLabel(f)} L${f.startLine}-${f.endLine}: ${f.bitwiseOps} bitwise ops — explain intent in a comment or name intermediate values.`,
    );
  }
  if (metrics.globalAssignments.length > 0) {
    risks.push(`Top-level state mutated: ${metrics.globalAssignments.slice(0, 5).join(', ')}.`);
  }

  if (reasons.length === 0) {
    reasons.push('No major cognitive load indicators detected.');
  }

  return {
    score: clamp(score),
    reasons,
    risks: risks.slice(0, 12),
  };
}

function functionLabel(f: FunctionMetrics): string {
  return f.ownerClass ? `${f.ownerClass}.${f.name}` : f.name;
}
