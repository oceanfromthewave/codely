import * as path from 'path';
import { parse, type ParserPlugin } from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import {
  AnalysisMode,
  AnalyzeOptions,
  CodelyReport,
  AnalyzeFullResult,
  ClassMetrics,
  FileMetrics,
  FunctionMetrics,
  SupportedLanguage,
} from './schema';
import { computeComplexity } from './complexity';
import { computeFatigue } from './fatigue';
import { generateRefactors } from './refactor';
import { translateToHuman, generateIntent, generateSummary } from './translate';
import { describeTopLevelStatement, isPoorName } from './naming';
import { applyLineDeltaToMetrics, prepareSourceForAnalysis } from './embed';
import { analyzeNativeWithMetrics, NATIVE_LANGUAGE_IDS } from './native';

const POOR_NAME_EXCEPT = new Set(['i', 'j', 'k', 'x', 'y', 'z', 'e', '_', 't']);

function pickPlugins(lang: SupportedLanguage, filename: string | undefined) {
  const extLower = (filename ?? '').toLowerCase();
  const isTs =
    lang === 'typescript' ||
    lang === 'tsx' ||
    (lang === 'auto' &&
      (extLower.endsWith('.ts') ||
        extLower.endsWith('.tsx') ||
        extLower.endsWith('.mts') ||
        extLower.endsWith('.cts')));
  const isJsx =
    lang === 'jsx' || lang === 'tsx' || (lang === 'auto' && (extLower.endsWith('.jsx') || extLower.endsWith('.tsx')));
  const plugins: ParserPlugin[] = [];
  if (isTs) plugins.push('typescript');
  if (isJsx) plugins.push('jsx');
  plugins.push('decorators-legacy', 'classProperties', 'classPrivateProperties', 'classPrivateMethods');
  return plugins;
}

function tryParse(code: string, plugins: ParserPlugin[]) {
  return parse(code, {
    sourceType: 'unambiguous',
    allowReturnOutsideFunction: true,
    allowImportExportEverywhere: true,
    errorRecovery: true,
    plugins,
  });
}

function functionName(path: NodePath<t.Function>): string {
  const node = path.node;
  if (t.isFunctionDeclaration(node) && node.id) return node.id.name;
  if (t.isFunctionExpression(node) && node.id) return node.id.name;
  if (t.isClassMethod(node) || t.isObjectMethod(node)) {
    const key = node.key as t.Identifier | t.StringLiteral | t.NumericLiteral;
    if (t.isIdentifier(key)) return key.name;
    if (t.isStringLiteral(key)) return key.value;
    if (t.isNumericLiteral(key)) return String(key.value);
  }
  const parent = path.parentPath?.node;
  if (parent) {
    if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) return parent.id.name;
    if (t.isAssignmentExpression(parent)) {
      const left = parent.left;
      if (t.isIdentifier(left)) return left.name;
      if (t.isMemberExpression(left) && t.isIdentifier(left.property)) return left.property.name;
    }
    if (t.isObjectProperty(parent) && t.isIdentifier(parent.key)) return parent.key.name;
  }
  return '(anonymous)';
}

function functionKind(path: NodePath<t.Function>): FunctionMetrics['kind'] {
  const n = path.node;
  if (t.isArrowFunctionExpression(n)) return 'arrow';
  if (t.isClassMethod(n)) return n.kind === 'constructor' ? 'constructor' : 'method';
  if (t.isObjectMethod(n)) return 'method';
  return 'function';
}

function lineOf(node: t.Node, key: 'start' | 'end'): number {
  return node.loc?.[key]?.line ?? 0;
}

const KNOWN_SIDE_EFFECT_OBJECTS = new Set([
  'console',
  'process',
  'fs',
  'globalThis',
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'navigator',
]);

const KNOWN_SIDE_EFFECT_CALLS = new Set([
  'fetch',
  'require',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'alert',
  'prompt',
  'confirm',
]);

function describeCallSideEffect(node: t.CallExpression): string | null {
  const callee = node.callee;
  if (t.isMemberExpression(callee)) {
    if (t.isIdentifier(callee.object) && KNOWN_SIDE_EFFECT_OBJECTS.has(callee.object.name)) {
      const prop = t.isIdentifier(callee.property) ? callee.property.name : '?';
      return `${callee.object.name}.${prop}()`;
    }
    if (t.isIdentifier(callee.property)) {
      const prop = callee.property.name;
      if (prop === 'addEventListener' || prop === 'removeEventListener') return `${prop} (DOM event binding)`;
      if (prop === 'emit' || prop === 'dispatch' || prop === 'publish') return `event ${prop}()`;
    }
  }
  if (t.isIdentifier(callee) && KNOWN_SIDE_EFFECT_CALLS.has(callee.name)) {
    return `${callee.name}() (global I/O)`;
  }
  return null;
}

function detectPatterns(path: NodePath<t.Function>): string[] {
  const patterns = new Set<string>();
  const bodyNode = path.node.body;
  if (!bodyNode) return [];
  const params = path.node.params;

  if (t.isBlockStatement(bodyNode)) {
    const stmts = bodyNode.body;
    if (stmts.length === 1 && t.isReturnStatement(stmts[0])) {
      const arg = stmts[0].argument;
      if (arg && (t.isMemberExpression(arg) || t.isIdentifier(arg) || t.isThisExpression(arg))) {
        patterns.add('getter');
      }
    }
    const setterLike = stmts.some(
      (s) =>
        t.isExpressionStatement(s) &&
        t.isAssignmentExpression(s.expression) &&
        t.isMemberExpression(s.expression.left) &&
        t.isThisExpression(s.expression.left.object),
    );
    if (setterLike && params.length >= 1) patterns.add('setter');

    let guards = 0;
    for (const s of stmts) {
      if (
        t.isIfStatement(s) &&
        (t.isThrowStatement(s.consequent) ||
          (t.isBlockStatement(s.consequent) &&
            s.consequent.body.some((b) => t.isThrowStatement(b) || t.isReturnStatement(b))))
      ) {
        guards++;
      }
    }
    if (guards >= 2) patterns.add('validator/guard');
  }

  path.traverse({
    CallExpression(p) {
      const callee = p.node.callee;
      if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
        const name = callee.property.name;
        if (name === 'map') patterns.add('mapper');
        if (name === 'filter') patterns.add('filter');
        if (name === 'reduce' || name === 'reduceRight') patterns.add('reducer');
        if (name === 'forEach') patterns.add('iterator');
        if (name === 'parse' && t.isIdentifier(callee.object) && callee.object.name === 'JSON') patterns.add('parser');
      }
      if (
        t.isIdentifier(callee) &&
        (callee.name === 'fetch' ||
          callee.name === 'parse' ||
          callee.name === 'parseInt' ||
          callee.name === 'parseFloat')
      ) {
        if (callee.name === 'fetch') patterns.add('fetcher');
        if (callee.name === 'parse') patterns.add('parser');
      }
    },
    AwaitExpression() {
      patterns.add('async-flow');
    },
    SwitchStatement(p) {
      if (p.node.cases.length >= 4) patterns.add('switch-heavy');
    },
  });

  if (path.node.async) patterns.add('async-flow');

  return Array.from(patterns);
}

const BITWISE_BIN_OPS = new Set(['&', '|', '^', '<<', '>>', '>>>']);

function analyzeFunction(path: NodePath<t.Function>, ownerClass?: string): FunctionMetrics {
  const node = path.node;
  let cyclomatic = 1;
  let maxDepth = 0;
  let currentDepth = 0;
  let currentTernaryDepth = 0;
  let maxTernaryDepth = 0;
  let bitwiseOps = 0;
  let loopNesting = 0;
  let maxLoopNesting = 0;
  let hasAwait = false;
  let returnPaths = 0;
  const sideEffects = new Set<string>();

  const enterDepth = () => {
    currentDepth++;
    if (currentDepth > maxDepth) maxDepth = currentDepth;
  };
  const exitDepth = () => {
    currentDepth--;
  };
  const enterTernary = () => {
    cyclomatic++;
    currentTernaryDepth++;
    if (currentTernaryDepth > maxTernaryDepth) maxTernaryDepth = currentTernaryDepth;
    enterDepth();
  };
  const exitTernary = () => {
    currentTernaryDepth--;
    exitDepth();
  };
  const enterLoop = () => {
    loopNesting++;
    if (loopNesting > maxLoopNesting) maxLoopNesting = loopNesting;
    enterDepth();
  };
  const exitLoop = () => {
    loopNesting--;
    exitDepth();
  };

  path.traverse({
    IfStatement: {
      enter: () => {
        cyclomatic++;
        enterDepth();
      },
      exit: exitDepth,
    },
    ConditionalExpression: { enter: enterTernary, exit: exitTernary },
    LogicalExpression(p) {
      if (p.node.operator === '&&' || p.node.operator === '||' || p.node.operator === '??') cyclomatic++;
    },
    BinaryExpression(p) {
      if (BITWISE_BIN_OPS.has(p.node.operator)) bitwiseOps++;
    },
    UnaryExpression(p) {
      if (p.node.operator === '~') bitwiseOps++;
    },
    SwitchCase(p) {
      if (p.node.test) cyclomatic++;
    },
    CatchClause: {
      enter: () => {
        cyclomatic++;
        enterDepth();
      },
      exit: exitDepth,
    },
    ForStatement: { enter: enterLoop, exit: exitLoop },
    ForInStatement: { enter: enterLoop, exit: exitLoop },
    ForOfStatement: { enter: enterLoop, exit: exitLoop },
    WhileStatement: { enter: enterLoop, exit: exitLoop },
    DoWhileStatement: { enter: enterLoop, exit: exitLoop },
    AwaitExpression() {
      hasAwait = true;
    },
    ReturnStatement() {
      returnPaths++;
    },
    CallExpression(p) {
      const se = describeCallSideEffect(p.node);
      if (se) sideEffects.add(se);
    },
    AssignmentExpression(p) {
      const left = p.node.left;
      if (
        t.isMemberExpression(left) &&
        t.isIdentifier(left.object) &&
        KNOWN_SIDE_EFFECT_OBJECTS.has(left.object.name)
      ) {
        sideEffects.add(`mutates ${left.object.name}`);
      }
    },
  });

  const start = lineOf(node, 'start');
  const end = lineOf(node, 'end');

  const detectedPatterns = detectPatterns(path);
  if (maxTernaryDepth >= 3) detectedPatterns.push('nested-ternary');
  if (bitwiseOps >= 5) detectedPatterns.push('bitwise-heavy');
  if (node.params.length >= 4) detectedPatterns.push('long-params');

  return {
    name: functionName(path),
    kind: functionKind(path),
    startLine: start,
    endLine: end,
    lengthLines: Math.max(1, end - start + 1),
    params: node.params.length,
    cyclomatic,
    maxDepth,
    ternaryDepth: maxTernaryDepth,
    bitwiseOps,
    isAsync: !!node.async,
    hasAwait,
    returnPaths,
    sideEffects: Array.from(sideEffects),
    detectedPatterns,
    loopNesting: maxLoopNesting,
    ownerClass,
  };
}

function collectFileMetrics(ast: t.File, source: string): FileMetrics {
  const lines = source.split('\n');
  const totalLines = lines.length;
  const nonBlankLines = lines.filter((l) => l.trim().length > 0).length;

  const commentLineSet = new Set<number>();
  for (const c of ast.comments ?? []) {
    if (!c.loc) continue;
    for (let ln = c.loc.start.line; ln <= c.loc.end.line; ln++) commentLineSet.add(ln);
  }
  const commentLines = commentLineSet.size;

  const todoComments: string[] = [];
  for (const c of ast.comments ?? []) {
    const v = c.value.trim();
    if (/^\s*(TODO|FIXME|HACK|XXX)\b/i.test(v)) todoComments.push(v.slice(0, 80));
  }

  const imports: string[] = [];
  const exports: string[] = [];
  let hasDefaultExport = false;
  const globalAssignments: string[] = [];
  const poorlyNamedIdentifiers = new Set<string>();
  let magicNumbers = 0;

  const functions: FunctionMetrics[] = [];
  const classes: ClassMetrics[] = [];

  const topLevelFlow: string[] = [];
  for (const stmt of ast.program.body) {
    const desc = describeTopLevelStatement(stmt);
    if (desc) topLevelFlow.push(desc);
  }

  traverse(ast, {
    ImportDeclaration(p) {
      imports.push(p.node.source.value);
    },
    ExportNamedDeclaration(p) {
      const decl = p.node.declaration;
      if (decl && 'id' in decl && decl.id && t.isIdentifier(decl.id)) exports.push(decl.id.name);
      for (const sp of p.node.specifiers ?? []) {
        if (t.isExportSpecifier(sp) && t.isIdentifier(sp.exported)) exports.push(sp.exported.name);
      }
    },
    ExportDefaultDeclaration() {
      hasDefaultExport = true;
    },
    VariableDeclarator(p) {
      if (t.isIdentifier(p.node.id) && isPoorName(p.node.id.name, POOR_NAME_EXCEPT)) {
        poorlyNamedIdentifiers.add(p.node.id.name);
      }
    },
    AssignmentExpression(p) {
      const left = p.node.left;
      if (!p.getFunctionParent()) {
        if (t.isMemberExpression(left)) {
          if (
            t.isIdentifier(left.object) &&
            left.object.name === 'module' &&
            t.isIdentifier(left.property) &&
            left.property.name === 'exports'
          ) {
            hasDefaultExport = true;
            const right = p.node.right;
            if (t.isObjectExpression(right)) {
              for (const prop of right.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) exports.push(prop.key.name);
              }
            }
            return;
          }
          if (t.isIdentifier(left.object) && left.object.name === 'exports' && t.isIdentifier(left.property)) {
            exports.push(left.property.name);
            return;
          }
          if (
            t.isMemberExpression(left.object) &&
            t.isIdentifier(left.object.object) &&
            left.object.object.name === 'module' &&
            t.isIdentifier(left.object.property) &&
            left.object.property.name === 'exports' &&
            t.isIdentifier(left.property)
          ) {
            exports.push(left.property.name);
            return;
          }
        }
        if (t.isIdentifier(left)) {
          globalAssignments.push(left.name);
        }
      }
    },
    NumericLiteral(p) {
      const v = p.node.value;
      if (v !== 0 && v !== 1 && v !== -1 && v !== 2 && Math.abs(v) > 1) {
        if (!t.isVariableDeclarator(p.parent) || !t.isIdentifier((p.parent as t.VariableDeclarator).id)) {
          if (!t.isObjectProperty(p.parent)) magicNumbers++;
        }
      }
    },
    Function(p) {
      let ownerClass: string | undefined;
      const classParent = p.findParent((pp) => pp.isClassDeclaration() || pp.isClassExpression());
      if (classParent) {
        const node = classParent.node as t.ClassDeclaration | t.ClassExpression;
        if (node.id) ownerClass = node.id.name;
      }
      for (const param of p.node.params) {
        const idNode = t.isAssignmentPattern(param) ? param.left : param;
        if (t.isIdentifier(idNode) && isPoorName(idNode.name, POOR_NAME_EXCEPT)) {
          poorlyNamedIdentifiers.add(idNode.name);
        }
      }
      functions.push(analyzeFunction(p, ownerClass));
    },
    ClassDeclaration(p) {
      const node = p.node;
      const methodCount = node.body.body.filter((m) => t.isClassMethod(m)).length;
      const hasConstructor = node.body.body.some((m) => t.isClassMethod(m) && m.kind === 'constructor');
      let extendsName: string | undefined;
      if (node.superClass && t.isIdentifier(node.superClass)) extendsName = node.superClass.name;
      classes.push({
        name: node.id?.name ?? '(anonymous class)',
        startLine: lineOf(node, 'start'),
        endLine: lineOf(node, 'end'),
        methodCount,
        hasConstructor,
        extendsName,
      });
    },
  });

  return {
    totalLines,
    nonBlankLines,
    commentLines,
    topLevelStatements: ast.program.body.length,
    imports,
    exports,
    hasDefaultExport,
    globalAssignments,
    poorlyNamedIdentifiers: Array.from(poorlyNamedIdentifiers),
    todoComments,
    magicNumbers,
    functions,
    classes,
    topLevelFlow,
  };
}

function structureBreakdownLimit(mode: AnalysisMode | undefined): number {
  switch (mode) {
    case 'deep':
      return 32;
    case 'refactor':
      return 20;
    case 'architect':
      return 10;
    case 'standard':
    default:
      return 12;
  }
}

function buildStructureBreakdown(metrics: FileMetrics, mode: AnalysisMode | undefined) {
  const limit = structureBreakdownLimit(mode);
  return metrics.functions.slice(0, limit).map((fn) => {
    const responsibility = describeResponsibility(fn);
    const logic = describeLogic(fn);
    const owner = fn.ownerClass ? `${fn.ownerClass}.${fn.name}` : fn.name;
    return {
      part: `${fn.kind === 'arrow' ? 'arrow' : fn.kind} ${owner} (L${fn.startLine}-${fn.endLine})`,
      responsibility,
      logic,
    };
  });
}

function describeResponsibility(fn: FunctionMetrics): string {
  const tags = fn.detectedPatterns;
  if (tags.includes('getter')) return 'Returns a stored value (getter).';
  if (tags.includes('setter')) return 'Stores or mutates a value (setter).';
  if (tags.includes('validator/guard')) return 'Validates input and throws/returns early on failure.';
  if (tags.includes('fetcher')) return 'Fetches data from an external source.';
  if (tags.includes('parser')) return 'Parses or transforms structured input.';
  if (tags.includes('reducer')) return 'Aggregates a collection into a single value.';
  if (tags.includes('mapper')) return 'Transforms each item in a collection.';
  if (tags.includes('filter')) return 'Selects a subset of a collection.';
  if (tags.includes('switch-heavy')) return 'Dispatches behavior based on a discriminator.';
  if (fn.kind === 'constructor') return 'Initializes instance state.';
  return 'No dominant pattern detected — behavior is mixed or unique.';
}

function describeLogic(fn: FunctionMetrics): string {
  const bits: string[] = [];
  bits.push(`${fn.lengthLines} lines, ${fn.params} param${fn.params === 1 ? '' : 's'}`);
  bits.push(`cyclomatic ${fn.cyclomatic}`);
  if (fn.maxDepth > 1) bits.push(`max nesting depth ${fn.maxDepth}`);
  if (fn.ternaryDepth >= 2) bits.push(`nested ternaries (depth ${fn.ternaryDepth})`);
  if (fn.bitwiseOps >= 3) bits.push(`${fn.bitwiseOps} bitwise ops`);
  if (fn.loopNesting >= 2) bits.push(`nested loops (depth ${fn.loopNesting})`);
  if (fn.isAsync || fn.hasAwait) bits.push('async/await');
  if (fn.returnPaths > 1) bits.push(`${fn.returnPaths} return paths`);
  if (fn.sideEffects.length > 0) bits.push(`side effects: ${fn.sideEffects.slice(0, 3).join(', ')}`);
  if (fn.detectedPatterns.length > 0) bits.push(`patterns: ${fn.detectedPatterns.join(', ')}`);
  return bits.join('; ') + '.';
}

function estimateTimeComplexity(metrics: FileMetrics): string {
  const max = metrics.functions.reduce((m, f) => Math.max(m, f.loopNesting), 0);
  if (max === 0) return 'O(1) per call (no loops detected at function scope).';
  if (max === 1) return 'O(n) — single-level iteration over inputs.';
  if (max === 2) return 'O(n²) — nested iteration detected; verify whether both bounds scale with input.';
  return `O(n^${max}) — deeply nested loops (depth ${max}). Likely a hotspot.`;
}

function buildDataFlow(metrics: FileMetrics): string[] {
  const flow: string[] = [];
  if (metrics.imports.length > 0) {
    flow.push(
      `Inputs arrive via imports: ${metrics.imports.slice(0, 5).join(', ')}${metrics.imports.length > 5 ? ', …' : ''}.`,
    );
  }
  const fetchers = metrics.functions.filter((f) => f.detectedPatterns.includes('fetcher'));
  if (fetchers.length > 0) flow.push(`External data is fetched by: ${fetchers.map((f) => f.name).join(', ')}.`);
  const sideEffectFns = metrics.functions.filter((f) => f.sideEffects.length > 0);
  if (sideEffectFns.length > 0) {
    flow.push(
      `Side effects (data leaves the function): ${sideEffectFns
        .map((f) => `${f.name}→${f.sideEffects[0]}`)
        .slice(0, 4)
        .join('; ')}.`,
    );
  }
  if (metrics.exports.length > 0 || metrics.hasDefaultExport) {
    const ex = [...metrics.exports];
    if (metrics.hasDefaultExport) ex.unshift('default');
    flow.push(`Results leave via exports: ${ex.slice(0, 6).join(', ')}.`);
  }
  if (flow.length === 0) flow.push('No external boundaries detected — purely local computation.');
  return flow;
}

function emptyMetrics(code: string): FileMetrics {
  const lines = code.split('\n').length;
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

function parseErrorReport(err: unknown): CodelyReport {
  const message = err instanceof Error ? err.message : String(err);
  return {
    summary: 'Could not parse the input as JavaScript/TypeScript.',
    intent: 'Parsing failed — file may be a different language or have a fatal syntax error.',
    high_level_flow: [],
    structure_breakdown: [],
    data_flow: [],
    complexity_analysis: {
      time_complexity_estimate: 'unknown',
      readability_score: 0,
      maintainability_score: 0,
    },
    code_fatigue_analysis: {
      fatigue_score: 0,
      fatigue_reason: [`parser error: ${message.slice(0, 200)}`],
      risk_points: [],
    },
    refactoring_suggestions: [],
    human_translation:
      'The file could not be parsed by the Codely engine. If this is a non-JS/TS language, Codely v0.1 does not support it yet.',
  };
}

export function analyzeWithMetrics(code: string, opts: AnalyzeOptions = {}): AnalyzeFullResult {
  const originalFilename = opts.filename ?? '';
  const prep = prepareSourceForAnalysis(code, originalFilename, opts.languageId);
  code = prep.code;
  const filenameForParser = prep.filenameForParser;
  const lineDelta = prep.lineDelta;

  const language = opts.language ?? 'auto';
  const mode = opts.mode ?? 'standard';

  // Check if it's a native language supported by heuristic engine
  const ext = path.extname(filenameForParser).toLowerCase().slice(1);
  const langId = opts.languageId ?? ext;
  if (NATIVE_LANGUAGE_IDS.has(langId)) {
    return analyzeNativeWithMetrics(code, langId, filenameForParser, mode);
  }

  const plugins = pickPlugins(language, filenameForParser);

  let ast: t.File;
  try {
    ast = tryParse(code, plugins);
  } catch (err: unknown) {
    // If Babel fails, try native heuristic as a fallback if it looks like a supported extension
    if (NATIVE_LANGUAGE_IDS.has(langId)) {
      return analyzeNativeWithMetrics(code, langId, filenameForParser, mode);
    }
    return { report: parseErrorReport(err), metrics: emptyMetrics(code) };
  }

  const metrics = collectFileMetrics(ast, code);
  applyLineDeltaToMetrics(metrics, lineDelta);
  const complexity = computeComplexity(metrics);
  const fatigue = computeFatigue(metrics);
  const refactors = generateRefactors(metrics, mode, opts.config, code, ast, opts.locale);
  const summary = generateSummary(metrics, opts.locale);
  const intent = generateIntent(metrics, opts.locale);
  const human = translateToHuman(metrics, summary, intent, opts.locale);

  const high_level_flow =
    metrics.topLevelFlow.length > 0
      ? metrics.topLevelFlow
      : ['(file body is empty or contains no top-level statements)'];

  const report: CodelyReport = {
    summary,
    intent,
    high_level_flow,
    structure_breakdown: buildStructureBreakdown(metrics, mode),
    data_flow: buildDataFlow(metrics),
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

  return { report, metrics };
}

export function analyze(code: string, opts: AnalyzeOptions = {}): CodelyReport {
  return analyzeWithMetrics(code, opts).report;
}

export function perFunctionLoadScore(fn: FunctionMetrics): number {
  let s = 0;
  if (fn.cyclomatic >= 15) s += 3;
  else if (fn.cyclomatic >= 10) s += 2;
  else if (fn.cyclomatic >= 6) s += 1;
  if (fn.maxDepth >= 5) s += 3;
  else if (fn.maxDepth >= 4) s += 2;
  else if (fn.maxDepth >= 3) s += 1;
  if (fn.ternaryDepth >= 4) s += 2;
  else if (fn.ternaryDepth >= 3) s += 1;
  if (fn.bitwiseOps >= 8) s += 2;
  else if (fn.bitwiseOps >= 5) s += 1;
  if (fn.lengthLines > 60) s += 2;
  else if (fn.lengthLines > 40) s += 1;
  if (fn.loopNesting >= 2) s += 1;
  if (fn.sideEffects.length >= 3) s += 1;
  return s;
}
