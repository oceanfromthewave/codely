import { FileMetrics } from './schema';

function clamp(n: number, lo = 0, hi = 10): number {
  return Math.max(lo, Math.min(hi, n));
}

export function computeComplexity(metrics: FileMetrics): {
  readability: number;
  maintainability: number;
} {
  let readability = 10;
  let maintainability = 10;

  const fns = metrics.functions;
  if (fns.length > 0) {
    const avgLen = fns.reduce((s, f) => s + f.lengthLines, 0) / fns.length;
    const maxCyclo = fns.reduce((m, f) => Math.max(m, f.cyclomatic), 0);
    const maxDepth = fns.reduce((m, f) => Math.max(m, f.maxDepth), 0);
    const sideEffectFns = fns.filter((f) => f.sideEffects.length > 0).length;

    if (avgLen > 50) readability -= 2;
    else if (avgLen > 25) readability -= 1;

    if (maxDepth >= 5) readability -= 3;
    else if (maxDepth >= 4) readability -= 2;
    else if (maxDepth >= 3) readability -= 1;

    if (maxCyclo >= 20) readability -= 3;
    else if (maxCyclo >= 12) readability -= 2;
    else if (maxCyclo >= 8) readability -= 1;

    const maxTernary = fns.reduce((m, f) => Math.max(m, f.ternaryDepth), 0);
    if (maxTernary >= 4) readability -= 3;
    else if (maxTernary >= 3) readability -= 2;
    else if (maxTernary >= 2) readability -= 1;

    const maxBitwise = fns.reduce((m, f) => Math.max(m, f.bitwiseOps), 0);
    if (maxBitwise >= 8) readability -= 2;
    else if (maxBitwise >= 5) readability -= 1;

    if (metrics.poorlyNamedIdentifiers.length >= 5) readability -= 2;
    else if (metrics.poorlyNamedIdentifiers.length >= 2) readability -= 1;

    if (sideEffectFns / fns.length > 0.5) maintainability -= 2;
    if (metrics.globalAssignments.length > 0) maintainability -= 2;
    if (metrics.magicNumbers >= 5) maintainability -= 1;
    if (metrics.todoComments.length >= 3) maintainability -= 1;
    if (!metrics.hasDefaultExport && metrics.exports.length === 0 && fns.length > 1) maintainability -= 1;

    if (avgLen > 50) maintainability -= 1;
    if (maxCyclo >= 15) maintainability -= 2;
  } else {
    if (metrics.totalLines > 100) {
      readability -= 1;
    }
  }

  return {
    readability: clamp(Math.round(readability)),
    maintainability: clamp(Math.round(maintainability)),
  };
}
