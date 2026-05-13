import { AnalysisMode, FileMetrics } from './schema';

export function generateRefactors(metrics: FileMetrics, mode: AnalysisMode = 'standard'): string[] {
  const suggestions: string[] = [];
  const fns = metrics.functions;

  const longFns = fns.filter((f) => f.lengthLines > 40);
  const branchy = fns.filter((f) => f.cyclomatic >= 10);
  const deep = fns.filter((f) => f.maxDepth >= 4);
  const switchHeavy = fns.filter((f) => f.detectedPatterns.includes('switch-heavy'));
  const nestedLoops = fns.filter((f) => f.loopNesting >= 2);
  const ternaryChains = fns.filter((f) => f.ternaryDepth >= 3);
  const bitwiseTricks = fns.filter((f) => f.bitwiseOps >= 5);

  for (const f of branchy) {
    suggestions.push(
      `Split ${labelOf(f)} (cyclomatic ${f.cyclomatic}) — extract each decision branch into a small named function. Goal: every function has ≤5 decision points.`,
    );
  }
  for (const f of deep) {
    suggestions.push(
      `Flatten ${labelOf(f)} (nesting depth ${f.maxDepth}) — replace the outer ifs with guard clauses / early returns so the happy path stays at indentation 1.`,
    );
  }
  for (const f of longFns) {
    suggestions.push(
      `Shrink ${labelOf(f)} (${f.lengthLines} lines) — group adjacent statements that share a purpose and extract them as helpers with names that describe *why*, not *what*.`,
    );
  }
  for (const f of switchHeavy) {
    suggestions.push(
      `${labelOf(f)} dispatches by switch with many cases — consider a lookup map (\`const handlers = { kind: fn, ... }\`) so adding a kind doesn't require editing the function.`,
    );
  }
  for (const f of nestedLoops) {
    suggestions.push(
      `${labelOf(f)} has nested loops (depth ${f.loopNesting}) — verify both bounds scale with input. If they do, look for a map/set lookup to break the O(n^${f.loopNesting}) cost.`,
    );
  }
  for (const f of ternaryChains) {
    suggestions.push(
      `${labelOf(f)} uses chained ternaries (depth ${f.ternaryDepth}) — convert to if/else or extract each branch to a named function. \`?:\` is fine for one level; past that it hides intent.`,
    );
  }
  for (const f of bitwiseTricks) {
    suggestions.push(
      `${labelOf(f)} relies on ${f.bitwiseOps} bitwise operations — if this is intentional (hashing, flags, fast math), add a one-line comment explaining the trick. If not, replace with arithmetic that names the intent.`,
    );
  }

  if (metrics.poorlyNamedIdentifiers.length >= 2) {
    suggestions.push(
      `Rename ambiguous identifiers (${metrics.poorlyNamedIdentifiers.slice(0, 5).join(', ')}) — names should answer "what is this value for?" not "what type is it?".`,
    );
  }

  if (metrics.globalAssignments.length > 0) {
    suggestions.push(
      `Eliminate top-level mutations (${metrics.globalAssignments.slice(0, 3).join(', ')}) — encapsulate state inside a function or module export. Globals make every other function harder to reason about.`,
    );
  }

  if (metrics.magicNumbers >= 5) {
    suggestions.push(
      `Replace magic numbers with named constants — there are at least ${metrics.magicNumbers} literal numbers in the file body that future readers will have to interpret.`,
    );
  }

  if (metrics.todoComments.length >= 1) {
    suggestions.push(
      `Triage TODOs (${metrics.todoComments.length} found) — either resolve them, link to a tracked ticket, or delete if obsolete. Old TODOs become invisible.`,
    );
  }

  const sideEffectHeavy = fns.filter((f) => f.sideEffects.length >= 2);
  if (sideEffectHeavy.length > 0) {
    suggestions.push(
      `Push side effects (${sideEffectHeavy.map((f) => f.name).slice(0, 3).join(', ')}) to the edges — keep the core logic pure and call I/O once at the boundary so tests don't need mocks.`,
    );
  }

  if (suggestions.length === 0) {
    suggestions.push('No mechanical refactor patterns triggered. Code reads cleanly by the heuristics we measure.');
  }

  const architectHead: string[] = [];
  if (mode === 'architect') {
    if (metrics.imports.length > 12) {
      architectHead.push(
        `This module pulls in ${metrics.imports.length} dependencies — sketch a boundary diagram: which imports are stable infrastructure vs. feature coupling?`,
      );
    }
    if (metrics.classes.length >= 3) {
      architectHead.push(
        `${metrics.classes.length} classes live in one file — consider splitting by responsibility so each file maps to one subsystem.`,
      );
    }
    if (metrics.exports.length > 8 || (metrics.hasDefaultExport && metrics.exports.length > 6)) {
      architectHead.push(
        'The public surface area is wide — trim exports to what callers need; keep helpers unexported to preserve refactor freedom.',
      );
    }
    if (metrics.functions.length > 25) {
      architectHead.push(
        `${metrics.functions.length} functions in a single module — readers cannot hold the whole graph; extract folders or namespaces by feature.`,
      );
    }
  }

  const combined = mode === 'architect' ? [...architectHead, ...suggestions] : suggestions;

  switch (mode) {
    case 'deep':
      return combined;
    case 'refactor':
      return combined.slice(0, 24);
    case 'architect':
      return combined.slice(0, 22);
    case 'standard':
    default:
      return combined.slice(0, 12);
  }
}

function labelOf(f: { name: string; ownerClass?: string }): string {
  return f.ownerClass ? `${f.ownerClass}.${f.name}` : f.name;
}
