import { FileMetrics, FunctionMetrics, CodelyReport } from './schema';

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

export function generateHtmlReport(report: CodelyReport, filename: string): string {
  const fScore = report.code_fatigue_analysis.fatigue_score;
  const fColor = fScore >= 7 ? '#ef4444' : fScore >= 4 ? '#f59e0b' : '#10b981';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Codely Report - ${filename}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 900px; margin: 0 auto; padding: 2rem; background: #f9fafb; }
        .card { background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 1.5rem; margin-bottom: 1.5rem; }
        h1 { font-size: 1.875rem; color: #111; margin-bottom: 0.5rem; }
        h2 { font-size: 1.25rem; color: #374151; margin-top: 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; }
        .stat { text-align: center; padding: 1rem; background: #f3f4f6; border-radius: 6px; }
        .stat-value { font-size: 1.5rem; font-weight: bold; color: #111; }
        .stat-label { font-size: 0.875rem; color: #6b7280; }
        .badge { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
        .fatigue-bar { height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin-top: 0.5rem; }
        .fatigue-fill { height: 100%; }
        ul { padding-left: 1.25rem; }
        li { margin-bottom: 0.5rem; }
        code { background: #f3f4f6; padding: 0.2rem 0.4rem; border-radius: 4px; font-family: monospace; }
        .suggestion { border-left: 4px solid #3b82f6; padding-left: 1rem; }
        .suggestions { list-style: none; padding-left: 0; }
    </style>
</head>
<body>
    <h1>Codely Analysis Report</h1>
    <p style="color: #6b7280; margin-bottom: 2rem;">File: <code>${filename}</code></p>

    <div class="card">
        <h2>Summary & Intent</h2>
        <p><strong>Intent:</strong> ${report.intent}</p>
        <p>${report.summary}</p>
    </div>

    <div class="grid">
        <div class="card">
            <h2>Fatigue Score</h2>
            <div class="stat-value" style="color: ${fColor}">${fScore}/10</div>
            <div class="fatigue-bar"><div class="fatigue-fill" style="width: ${fScore * 10}%; background: ${fColor}"></div></div>
            <ul style="margin-top: 1rem; font-size: 0.875rem;">
                ${report.code_fatigue_analysis.fatigue_reason.map(r => `<li>${r}</li>`).join('')}
            </ul>
        </div>
        <div class="card">
            <h2>Complexity</h2>
            <p><strong>Time:</strong> ${report.complexity_analysis.time_complexity_estimate}</p>
            <p><strong>Readability:</strong> ${report.complexity_analysis.readability_score}/10</p>
            <p><strong>Maintainability:</strong> ${report.complexity_analysis.maintainability_score}/10</p>
        </div>
    </div>

    <div class="card">
        <h2>Refactoring Suggestions</h2>
        <ul class="suggestions">
            ${report.refactoring_suggestions.map(s => `<li class="suggestion">${s}</li>`).join('')}
        </ul>
    </div>

    <div class="card">
        <h2>Structure Breakdown</h2>
        ${report.structure_breakdown.map(p => `
            <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #f3f4f6;">
                <div style="font-weight: bold; color: #2563eb;">${p.part}</div>
                <div style="font-size: 0.875rem; color: #4b5563;"><strong>Why:</strong> ${p.responsibility}</div>
                <div style="font-size: 0.875rem; color: #4b5563;"><strong>How:</strong> ${p.logic}</div>
            </div>
        `).join('')}
    </div>

    <div class="card">
        <h2>Human Translation</h2>
        <p style="white-space: pre-wrap;">${report.human_translation}</p>
    </div>

    <footer style="text-align: center; margin-top: 4rem; color: #9ca3af; font-size: 0.75rem;">
        Generated by Codely v0.1 — Fully Local Static Analysis
    </footer>
</body>
</html>
  `;
}
