import { FileMetrics, FunctionMetrics } from './schema';

function topPatterns(metrics: FileMetrics): string[] {
  const tally = new Map<string, number>();
  for (const f of metrics.functions) {
    for (const p of f.detectedPatterns) tally.set(p, (tally.get(p) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

export function generateSummary(metrics: FileMetrics): string {
  const fnCount = metrics.functions.length;
  const classCount = metrics.classes.length;
  const lines = metrics.totalLines;
  const patterns = topPatterns(metrics).slice(0, 3);

  const parts: string[] = [];
  if (classCount > 0 && fnCount === 0) {
    parts.push(`A ${lines}-line file defining ${classCount} class${classCount === 1 ? '' : 'es'}.`);
  } else if (classCount > 0) {
    parts.push(`A ${lines}-line file with ${classCount} class${classCount === 1 ? '' : 'es'} and ${fnCount} top-level function${fnCount === 1 ? '' : 's'}/method${fnCount === 1 ? '' : 's'}.`);
  } else if (fnCount > 0) {
    parts.push(`A ${lines}-line script with ${fnCount} function${fnCount === 1 ? '' : 's'}.`);
  } else {
    parts.push(`A ${lines}-line script with no function-scoped logic.`);
  }

  if (patterns.length > 0) {
    parts.push(`Dominant patterns: ${patterns.join(', ')}.`);
  }
  if (metrics.imports.length > 0) {
    parts.push(`Depends on ${metrics.imports.length} import${metrics.imports.length === 1 ? '' : 's'}.`);
  }
  return parts.join(' ');
}

export function generateIntent(metrics: FileMetrics): string {
  const patterns = topPatterns(metrics);
  const hasFetcher = patterns.includes('fetcher');
  const hasParser = patterns.includes('parser');
  const hasValidator = patterns.includes('validator/guard');
  const hasMapper = patterns.includes('mapper') || patterns.includes('reducer') || patterns.includes('filter');
  const hasDispatcher = patterns.includes('switch-heavy');
  const hasGetterSetter = patterns.includes('getter') || patterns.includes('setter');
  const hasClasses = metrics.classes.length > 0;

  const guesses: string[] = [];

  if (hasFetcher && hasParser) guesses.push('fetches remote data and normalizes it into a local shape');
  else if (hasFetcher) guesses.push('coordinates an external request');
  else if (hasParser) guesses.push('parses/normalizes structured input');
  if (hasValidator) guesses.push('enforces preconditions before downstream code runs');
  if (hasDispatcher) guesses.push('dispatches behavior across many discrete cases');
  if (hasMapper) guesses.push('transforms a collection into a different shape');
  if (hasGetterSetter && hasClasses) guesses.push('encapsulates state behind accessor methods');

  if (guesses.length === 0) {
    if (hasClasses) {
      const cls = metrics.classes[0];
      const ext = cls.extendsName ? ` extending ${cls.extendsName}` : '';
      guesses.push(`models a ${cls.name}${ext} with ${cls.methodCount} method${cls.methodCount === 1 ? '' : 's'}`);
    } else if (metrics.functions.length > 0) {
      const fn = metrics.functions[0];
      guesses.push(`exposes ${fn.name}(${fn.params}) as its primary operation`);
    } else {
      guesses.push('runs a sequence of top-level statements — likely a script entry point');
    }
  }

  const prefix = guesses.length > 1 ? 'Likely intent: this file ' : 'Likely intent: this file ';
  return `${prefix}${guesses.join(', and ')}.${qualifierForCertainty(metrics)}`;
}

function qualifierForCertainty(metrics: FileMetrics): string {
  const fnCount = metrics.functions.length;
  const totalPatterns = metrics.functions.reduce((s, f) => s + f.detectedPatterns.length, 0);
  const ratio = fnCount === 0 ? 0 : totalPatterns / fnCount;
  if (ratio >= 1.5) return ' (high confidence — pattern density is strong)';
  if (ratio >= 0.7) return ' (moderate confidence — verify against function names and call sites)';
  return ' (low confidence — patterns were sparse; treat this as a starting hypothesis)';
}

export function translateToHuman(metrics: FileMetrics, summary: string, intent: string): string {
  const lines: string[] = [];

  lines.push(summary);

  if (metrics.imports.length > 0) {
    lines.push(
      `Inputs reach the file through imports of ${metrics.imports.slice(0, 4).map((s) => `'${s}'`).join(', ')}${metrics.imports.length > 4 ? ', and more' : ''}.`,
    );
  }

  if (metrics.classes.length > 0) {
    const c = metrics.classes[0];
    const ext = c.extendsName ? ` (extends ${c.extendsName})` : '';
    lines.push(`The central type is class \`${c.name}\`${ext}, which holds ${c.methodCount} method${c.methodCount === 1 ? '' : 's'}.`);
  }

  if (metrics.functions.length > 0) {
    const named = metrics.functions.filter((f) => f.name !== '(anonymous)');
    const headliner = named.sort((a, b) => b.lengthLines - a.lengthLines)[0] ?? metrics.functions[0];
    lines.push(
      `The most substantial function is \`${headliner.name}\` (${headliner.lengthLines} lines, cyclomatic ${headliner.cyclomatic}${
        headliner.maxDepth > 1 ? `, nesting depth ${headliner.maxDepth}` : ''
      }). ${behaviorPhrase(headliner)}`,
    );
  }

  lines.push(intent);

  const sideEffectFns = metrics.functions.filter((f) => f.sideEffects.length > 0);
  if (sideEffectFns.length > 0) {
    lines.push(
      `Watch for side effects: ${sideEffectFns
        .slice(0, 3)
        .map((f) => `${f.name} performs ${f.sideEffects[0]}`)
        .join('; ')}.`,
    );
  }

  if (metrics.exports.length > 0 || metrics.hasDefaultExport) {
    const ex: string[] = [];
    if (metrics.hasDefaultExport) ex.push('a default export');
    if (metrics.exports.length > 0) ex.push(`named exports {${metrics.exports.slice(0, 6).join(', ')}}`);
    lines.push(`The file exposes ${ex.join(' and ')} to the rest of the codebase.`);
  } else {
    lines.push('The file exports nothing — it is either a script entry point or its outputs are written through side effects.');
  }

  return lines.join(' ');
}

function behaviorPhrase(fn: FunctionMetrics): string {
  if (fn.detectedPatterns.includes('fetcher')) return 'It performs an external fetch and likely returns parsed data.';
  if (fn.detectedPatterns.includes('reducer')) return 'It folds a collection into a single value.';
  if (fn.detectedPatterns.includes('mapper')) return 'It transforms each element of an input collection.';
  if (fn.detectedPatterns.includes('filter')) return 'It selects a subset of inputs that pass a condition.';
  if (fn.detectedPatterns.includes('validator/guard')) return 'It rejects invalid inputs up front before doing the real work.';
  if (fn.detectedPatterns.includes('parser')) return 'It converts an input encoding into a structured form.';
  if (fn.detectedPatterns.includes('switch-heavy')) return 'It dispatches one of many behaviors based on a discriminator.';
  if (fn.kind === 'constructor') return 'It initializes state for new instances.';
  if (fn.cyclomatic >= 10) return 'Its many branches suggest several responsibilities are tangled together.';
  return 'Its behavior is a mix that did not match a single known pattern.';
}
