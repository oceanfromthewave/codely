import type {
  AnalysisMode,
  AnalyzeFullResult,
  ClassMetrics,
  CodelyReport,
  FileMetrics,
  FunctionMetrics,
} from '@codely/core';
import {
  computeComplexity,
  computeFatigue,
  generateRefactors,
  generateIntent,
  generateSummary,
  translateToHuman,
} from '@codely/core';

/** VS Code language ids handled with the native (non-Babel) heuristic engine. */
export const NATIVE_LANGUAGE_IDS = new Set([
  'c',
  'cpp',
  'cuda-cpp',
  'csharp',
  'java',
  'kotlin',
  'scala',
  'groovy',
  'objective-c',
  'objective-cpp',
]);

const NAME_BLACKLIST = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'synchronized', 'else', 'return']);

/** Replace comments and string literals with spaces; keep newlines so line numbers stay aligned. */
export function maskCommentsPreserveLines(source: string, languageId: string): string {
  const out = source.split('');
  const n = out.length;
  let i = 0;
  const isCppLike =
    languageId === 'cpp' ||
    languageId === 'cuda-cpp' ||
    languageId === 'objective-cpp' ||
    languageId === 'c' ||
    languageId === 'objective-c';

  const fill = (from: number, to: number) => {
    for (let k = from; k < to && k < n; k++) {
      if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
    }
  };

  while (i < n) {
    const c = out[i];

    if (languageId === 'kotlin' || languageId === 'scala') {
      if (c === '"' && out[i + 1] === '"' && out[i + 2] === '"') {
        const start = i;
        i += 3;
        while (i + 2 < n && !(out[i] === '"' && out[i + 1] === '"' && out[i + 2] === '"')) {
          if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' ';
          i++;
        }
        fill(start, Math.min(n, i + 3));
        i = Math.min(n, i + 3);
        continue;
      }
    }

    if (c === '/' && out[i + 1] === '/') {
      const s = i;
      i += 2;
      while (i < n && out[i] !== '\n') {
        out[i] = ' ';
        i++;
      }
      fill(s, i);
      continue;
    }

    if (c === '/' && out[i + 1] === '*') {
      const s = i;
      i += 2;
      while (i + 1 < n && !(out[i] === '*' && out[i + 1] === '/')) {
        if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' ';
        i++;
      }
      if (i + 1 < n) {
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 2;
      }
      fill(s, i);
      continue;
    }

    if (isCppLike && c === 'R' && out[i + 1] === '"') {
      const m = source.slice(i).match(/^R"([^()\\]{0,16})\(([\s\S]*?)\)\1"/);
      if (m) {
        const len = m[0].length;
        fill(i, i + len);
        i += len;
        continue;
      }
    }

    if (c === '"' || (isCppLike && c === "'")) {
      const quote = c;
      const s = i;
      i++;
      while (i < n) {
        if (out[i] === '\\') {
          if (i + 1 < n) {
            out[i] = ' ';
            out[i + 1] = ' ';
            i += 2;
            continue;
          }
        }
        if (out[i] === quote) {
          out[i] = ' ';
          i++;
          break;
        }
        if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' ';
        i++;
      }
      fill(s, i);
      continue;
    }

    if (c === "'" && !isCppLike) {
      const s = i;
      i++;
      while (i < n) {
        if (out[i] === '\\') {
          if (i + 1 < n) {
            out[i] = ' ';
            out[i + 1] = ' ';
            i += 2;
            continue;
          }
        }
        if (out[i] === "'") {
          out[i] = ' ';
          i++;
          break;
        }
        if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' ';
        i++;
      }
      fill(s, i);
      continue;
    }

    i++;
  }

  return out.join('');
}

function lineNumberAtIndex(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function matchingCloseBrace(source: string, openIdx: number): number {
  if (source[openIdx] !== '{') return -1;
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractNameFromHeader(header: string, languageId: string): string | undefined {
  const kotlinFun = header.match(/\bfun\s+([A-Za-z_]\w*)\s*\(/);
  if (languageId === 'kotlin' && kotlinFun) return kotlinFun[1];

  const scalaDef = header.match(/\bdef\s+([A-Za-z_]\w*)\s*\(/);
  if ((languageId === 'scala' || languageId === 'groovy') && scalaDef) return scalaDef[1];

  const csharp = header.match(/\b(?:async\s+)?(?:[\w<>[\],\s.]+\s+)?(\w+)\s*\([^)]*\)\s*(?:where[^{]+)?\s*\{\s*$/);
  if (languageId === 'csharp' && csharp && !NAME_BLACKLIST.has(csharp[1])) return csharp[1];

  const javaLike =
    header.match(/\b([A-Za-z_]\w*)\s*\([^)]*\)\s*(?:throws[^{]+)?\s*\{\s*$/m) ??
    header.match(/\b([A-Za-z_]\w*)\s*\([^)]*\)\s*\{\s*$/m);
  if (javaLike && !NAME_BLACKLIST.has(javaLike[1])) return javaLike[1];

  const cLike = header.match(/\b([A-Za-z_]\w*)\s*\([^)]*\)\s*(?:const\s*)?\s*\{\s*$/m);
  if (cLike && !NAME_BLACKLIST.has(cLike[1])) return cLike[1];

  return undefined;
}

function shouldSkipHeader(header: string, languageId: string): boolean {
  const tail = header.slice(-400).trimStart();
  if (/^\s*namespace\s+\w+\s*\{/.test(tail)) return true;
  if (/^\s*extern\s+"C"\s*\{/.test(tail)) return true;
  if (languageId === 'java' || languageId === 'kotlin') {
    if (/\bclass\s+\w+\s*(\([^)]*\))?\s*\{/.test(tail)) return true;
    if (/\b(?:interface|enum|record)\s+\w+\s*\{/.test(tail)) return true;
  }
  if (languageId === 'csharp' && /\b(?:class|interface|struct|enum|record)\s+\w+/.test(tail)) return true;
  if (languageId === 'cpp' || languageId === 'cuda-cpp' || languageId === 'objective-cpp') {
    if (/\b(?:class|struct|enum|union)\b[^;{]*\{/.test(tail)) return true;
  }
  return false;
}

function analyzeBody(
  body: string,
): Omit<FunctionMetrics, 'name' | 'kind' | 'startLine' | 'endLine' | 'ownerClass' | 'lengthLines' | 'params'> {
  let cyclomatic = 1;
  cyclomatic += (body.match(/\bif\b/g) ?? []).length;
  cyclomatic += (body.match(/\belse\s+if\b/g) ?? []).length;
  cyclomatic += (body.match(/\bfor\b/g) ?? []).length;
  cyclomatic += (body.match(/\bwhile\b/g) ?? []).length;
  cyclomatic += (body.match(/\bdo\b/g) ?? []).length;
  cyclomatic += (body.match(/\bswitch\b/g) ?? []).length;
  cyclomatic += (body.match(/\bcase\b/g) ?? []).length;
  cyclomatic += (body.match(/\bcatch\b/g) ?? []).length;
  cyclomatic += (body.match(/&&/g) ?? []).length;
  cyclomatic += (body.match(/\|\|/g) ?? []).length;
  cyclomatic += (body.match(/\?/g) ?? []).length;

  let maxDepth = 0;
  let cur = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '{') {
      cur++;
      if (cur > maxDepth) maxDepth = cur;
    } else if (ch === '}') cur--;
  }

  let maxTernary = 0;
  let tStack = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '?') {
      tStack++;
      if (tStack > maxTernary) maxTernary = tStack;
    } else if (body[i] === ':') {
      if (tStack > 0) tStack--;
    }
  }
  const ternaryDepth = maxTernary;

  const shifts = body.match(/<<|>>|>>>/g) ?? [];
  const bitwiseOps =
    (body.match(/(^|[^&])&([^&]|$)/g) ?? []).length +
    (body.match(/(^|[^|])\|([^|]|$)/g) ?? []).length +
    (body.match(/\^/g) ?? []).length +
    shifts.length;

  const loopBlocks = (body.match(/\b(for|while)\b/g) ?? []).length;
  const nestedLoop = /\b(for|while)\b[\s\S]{0,800}\b(for|while)\b/.test(body) ? 2 : loopBlocks ? 1 : 0;

  const sideEffects = new Set<string>();
  if (/\bprintf\s*\(/.test(body)) sideEffects.add('printf()');
  if (/\bfprintf\s*\(/.test(body)) sideEffects.add('fprintf()');
  if (/\bfopen\s*\(/.test(body)) sideEffects.add('fopen()');
  if (/\bmalloc\s*\(|calloc\s*\(|realloc\s*\(/.test(body)) sideEffects.add('heap allocation');
  if (/\bfree\s*\(/.test(body)) sideEffects.add('free()');
  if (/\bSystem\.out\.|System\.err\./.test(body)) sideEffects.add('System.out/err');
  if (/\bprintln\s*\(/.test(body)) sideEffects.add('println()');
  if (/\bConsole\.Write(Line)?\s*\(/.test(body)) sideEffects.add('Console.Write');
  if (/\bnew\s+File(Input|Output)?Stream\s*\(/.test(body)) sideEffects.add('file I/O');
  if (/\bstd::cout\b/.test(body)) sideEffects.add('std::cout');

  const detectedPatterns: string[] = [];
  if ((body.match(/\bswitch\b/g) ?? []).length && (body.match(/\bcase\b/g) ?? []).length >= 4)
    detectedPatterns.push('switch-heavy');
  if (/\bawait\b/.test(body)) detectedPatterns.push('async-flow');

  const returnPaths = (body.match(/\breturn\b/g) ?? []).length || 0;

  return {
    cyclomatic,
    maxDepth,
    ternaryDepth,
    bitwiseOps,
    isAsync: /\basync\b/.test(body),
    hasAwait: /\bawait\b/.test(body),
    returnPaths,
    sideEffects: Array.from(sideEffects),
    detectedPatterns,
    loopNesting: nestedLoop,
  };
}

function collectImports(source: string, languageId: string): string[] {
  const out: string[] = [];
  const lines = source.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (languageId === 'csharp' && t.startsWith('using ')) {
      out.push(t.replace(/;+$/, ''));
    } else if (
      (languageId === 'java' || languageId === 'kotlin' || languageId === 'scala' || languageId === 'groovy') &&
      t.startsWith('import ')
    ) {
      out.push(t.replace(/;+$/, ''));
    } else if (
      (languageId === 'c' ||
        languageId === 'cpp' ||
        languageId === 'cuda-cpp' ||
        languageId === 'objective-c' ||
        languageId === 'objective-cpp') &&
      /^\s*#\s*include\b/.test(line)
    ) {
      out.push(t);
    }
  }
  return out.slice(0, 200);
}

function collectClassesRough(masked: string, languageId: string): ClassMetrics[] {
  const classes: ClassMetrics[] = [];
  const reJava = /^\s*(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class\s+(\w+)\b/gm;
  const reCs = /^\s*(?:public\s+)?(?:abstract\s+)?(?:sealed\s+)?(?:partial\s+)?class\s+(\w+)\b/gm;
  const reCpp = /^\s*(?:class|struct)\s+(\w+)\b(?:\s*:\s*[^{]+)?\{/gm;
  let m: RegExpExecArray | null;
  if (languageId === 'java' || languageId === 'kotlin') {
    while ((m = reJava.exec(masked)) !== null) {
      const name = m[1];
      const startLine = lineNumberAtIndex(masked, m.index);
      classes.push({
        name,
        startLine,
        endLine: startLine,
        methodCount: 0,
        hasConstructor: false,
      });
    }
  } else if (languageId === 'csharp') {
    while ((m = reCs.exec(masked)) !== null) {
      const name = m[1];
      const startLine = lineNumberAtIndex(masked, m.index);
      classes.push({ name, startLine, endLine: startLine, methodCount: 0, hasConstructor: false });
    }
  } else if (languageId === 'cpp' || languageId === 'cuda-cpp' || languageId === 'objective-cpp') {
    while ((m = reCpp.exec(masked)) !== null) {
      const name = m[1];
      const startLine = lineNumberAtIndex(masked, m.index);
      classes.push({ name, startLine, endLine: startLine, methodCount: 0, hasConstructor: false });
    }
  }
  return classes.slice(0, 40);
}

function collectTodoComments(source: string): string[] {
  const out: string[] = [];
  for (const c of source.split('\n')) {
    const v = c.trim();
    if (/^\s*(TODO|FIXME|HACK|XXX)\b/i.test(v)) out.push(v.slice(0, 80));
  }
  return out.slice(0, 40);
}

function estimateTimeComplexity(metrics: FileMetrics): string {
  const max = metrics.functions.reduce((m, f) => Math.max(m, f.loopNesting), 0);
  if (max === 0) return 'O(1) per call (no loops detected heuristically).';
  if (max === 1) return 'O(n) — iteration patterns detected.';
  if (max === 2) return 'O(n²) — nested loops possible; verify bounds.';
  return `O(n^${max}) — nested loops (depth ${max}).`;
}

function buildStructureNative(metrics: FileMetrics, mode: AnalysisMode): CodelyReport['structure_breakdown'] {
  const limit = mode === 'deep' ? 32 : mode === 'refactor' ? 20 : mode === 'architect' ? 10 : 12;
  return metrics.functions.slice(0, limit).map((fn) => ({
    part: `function ${fn.name} (L${fn.startLine}-${fn.endLine})`,
    responsibility: 'Heuristic scan — inspect body for real responsibilities.',
    logic: `${fn.lengthLines} lines; cyclomatic ${fn.cyclomatic}; max brace depth ${fn.maxDepth}; loops ${fn.loopNesting}.`,
  }));
}

function buildDataFlowNative(metrics: FileMetrics): string[] {
  const flow: string[] = [];
  if (metrics.imports.length > 0) {
    flow.push(
      `Includes / imports: ${metrics.imports.slice(0, 6).join('; ')}${metrics.imports.length > 6 ? ' …' : ''}.`,
    );
  }
  const ioFns = metrics.functions.filter((f) => f.sideEffects.length > 0);
  if (ioFns.length > 0) {
    flow.push(
      `I/O or heap touches: ${ioFns
        .map((f) => `${f.name}→${f.sideEffects[0]}`)
        .slice(0, 4)
        .join('; ')}.`,
    );
  }
  if (flow.length === 0) flow.push('No obvious external I/O edges detected heuristically.');
  return flow;
}

function emptyNativeMetrics(lines: number): FileMetrics {
  return {
    totalLines: lines,
    nonBlankLines: 0,
    commentLines: 0,
    topLevelStatements: 0,
    imports: [],
    exports: [],
    hasDefaultExport: false,
    globalAssignments: [],
    poorlyNamedIdentifiers: [],
    todoComments: [],
    magicNumbers: 0,
    functions: [],
    classes: [],
    topLevelFlow: [],
  };
}

export function analyzeNativeWithMetrics(
  code: string,
  languageId: string,
  filename: string,
  mode: AnalysisMode,
): AnalyzeFullResult {
  const lines = code.split('\n').length;
  if (!code.trim()) {
    const metrics = emptyNativeMetrics(lines);
    const report = buildNativeReport(metrics, mode, languageId, filename, true);
    return { report, metrics };
  }

  const masked = maskCommentsPreserveLines(code, languageId);
  const imports = collectImports(code, languageId);
  const classes = collectClassesRough(masked, languageId);
  const todoComments = collectTodoComments(code);

  const functions: FunctionMetrics[] = [];
  const rx = /\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(masked)) !== null) {
    const openBrace = m.index + m[0].length - 1;
    const closeBrace = matchingCloseBrace(masked, openBrace);
    if (closeBrace < 0) continue;
    const headerStart = Math.max(0, openBrace - 1200);
    const header = masked.slice(headerStart, openBrace + 1);
    if (shouldSkipHeader(header, languageId)) continue;
    const name = extractNameFromHeader(header, languageId);
    if (!name) continue;
    const startLine = lineNumberAtIndex(masked, openBrace);
    const endLine = lineNumberAtIndex(masked, closeBrace);
    const body = masked.slice(openBrace + 1, closeBrace);
    const inner = analyzeBody(body);
    const lengthLines = Math.max(1, endLine - startLine + 1);
    const paren = header.lastIndexOf('(');
    const closeParen = header.lastIndexOf(')');
    let params = 0;
    if (paren >= 0 && closeParen > paren) {
      const inside = header.slice(paren + 1, closeParen).trim();
      if (inside.length > 0 && !inside.match(/^\s*void\s*$/i)) {
        params = inside.split(',').length;
      }
    }
    functions.push({
      name,
      kind: 'function',
      startLine,
      endLine,
      lengthLines,
      params,
      ...inner,
    });
  }

  const fnList = dedupeFunctions(functions);
  const nonBlankLines = code.split('\n').filter((l) => l.trim().length > 0).length;
  const metrics: FileMetrics = {
    totalLines: lines,
    nonBlankLines,
    commentLines: 0,
    topLevelStatements: 0,
    imports,
    exports: [],
    hasDefaultExport: false,
    globalAssignments: [],
    poorlyNamedIdentifiers: [],
    todoComments,
    magicNumbers: 0,
    functions: fnList,
    classes,
    topLevelFlow:
      fnList.length > 0
        ? [`Heuristic pass found ${fnList.length} function-like regions in ${languageId}.`]
        : ['No function-like `) {` regions matched — macros or unusual layout can hide bodies.'],
  };

  const report = buildNativeReport(metrics, mode, languageId, filename, false);
  return { report, metrics };
}

function dedupeFunctions(fns: FunctionMetrics[]): FunctionMetrics[] {
  const seen = new Set<string>();
  const out: FunctionMetrics[] = [];
  for (const f of fns) {
    const key = `${f.name}:${f.startLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out.sort((a, b) => a.startLine - b.startLine);
}

function buildNativeReport(
  metrics: FileMetrics,
  mode: AnalysisMode,
  languageId: string,
  filename: string,
  empty: boolean,
): CodelyReport {
  const complexity = computeComplexity(metrics);
  const fatigue = computeFatigue(metrics);
  const refactors = generateRefactors(metrics, mode);
  const summary = generateSummary(metrics);
  const intent = generateIntent(metrics);
  let human = translateToHuman(metrics, summary, intent);
  human += `\n\n(Native ${languageId} heuristic — not a full compiler AST; treat metrics as directional, especially near macros or generated code.)`;

  const high_level_flow =
    metrics.topLevelFlow.length > 0 ? metrics.topLevelFlow : ['(no high-level flow inferred for this native buffer)'];

  return {
    summary: empty ? 'Empty file.' : `${summary} [${languageId}]`,
    intent: empty ? 'Nothing to analyze.' : intent,
    high_level_flow,
    structure_breakdown: buildStructureNative(metrics, mode),
    data_flow: buildDataFlowNative(metrics),
    complexity_analysis: {
      time_complexity_estimate: estimateTimeComplexity(metrics),
      readability_score: complexity.readability,
      maintainability_score: complexity.maintainability,
    },
    code_fatigue_analysis: {
      fatigue_score: fatigue.score,
      fatigue_reason: fatigue.reasons,
      risk_points: fatigue.risks,
    },
    refactoring_suggestions: refactors,
    human_translation: human,
  };
}
