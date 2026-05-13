import * as t from '@babel/types';

const GENERIC_NAMES = new Set([
  'tmp',
  'temp',
  'foo',
  'bar',
  'baz',
  'qux',
  'data',
  'val',
  'value',
  'result',
  'obj',
  'arr',
  'item',
  'thing',
  'stuff',
  'aux',
  'misc',
]);

export function isPoorName(name: string, allowSingleLetters: Set<string>): boolean {
  if (name.length === 1) return !allowSingleLetters.has(name);
  if (name.length === 2 && /^[a-z]{2}$/.test(name)) {
    return !['id', 'ok', 'fn', 'cb', 'el', 'ev', 'ix'].includes(name);
  }
  return GENERIC_NAMES.has(name.toLowerCase());
}

function shortName(node: t.Node | null | undefined, limit = 60): string {
  if (!node) return '?';
  if (t.isIdentifier(node)) return node.name;
  if (t.isStringLiteral(node)) return `"${node.value.slice(0, 20)}"`;
  if (t.isNumericLiteral(node)) return String(node.value);
  return '…';
}

export function describeTopLevelStatement(stmt: t.Statement): string | null {
  if (t.isImportDeclaration(stmt)) {
    const names = stmt.specifiers
      .map((s) => {
        if (t.isImportDefaultSpecifier(s)) return s.local.name;
        if (t.isImportNamespaceSpecifier(s)) return `* as ${s.local.name}`;
        if (t.isImportSpecifier(s)) return t.isIdentifier(s.imported) ? s.imported.name : '?';
        return '?';
      })
      .join(', ');
    return `Imports {${names}} from '${stmt.source.value}'.`;
  }
  if (t.isExportDefaultDeclaration(stmt)) {
    const d = stmt.declaration;
    if (t.isFunctionDeclaration(d)) return `Exports default function ${d.id?.name ?? '(anonymous)'}.`;
    if (t.isClassDeclaration(d)) return `Exports default class ${d.id?.name ?? '(anonymous)'}.`;
    if (t.isIdentifier(d)) return `Exports default → ${d.name}.`;
    return 'Exports a default expression.';
  }
  if (t.isExportNamedDeclaration(stmt)) {
    const decl = stmt.declaration;
    if (decl && 'id' in decl && decl.id && t.isIdentifier(decl.id)) return `Exports ${decl.id.name}.`;
    const names = (stmt.specifiers ?? []).map((s) => (t.isExportSpecifier(s) && t.isIdentifier(s.exported) ? s.exported.name : '?')).join(', ');
    return `Exports {${names}}.`;
  }
  if (t.isFunctionDeclaration(stmt)) {
    const async = stmt.async ? 'async ' : '';
    return `Defines ${async}function ${stmt.id?.name ?? '(anonymous)'}(${stmt.params.length} param${stmt.params.length === 1 ? '' : 's'}).`;
  }
  if (t.isClassDeclaration(stmt)) {
    const ext = stmt.superClass && t.isIdentifier(stmt.superClass) ? ` extends ${stmt.superClass.name}` : '';
    return `Defines class ${stmt.id?.name ?? '(anonymous)'}${ext}.`;
  }
  if (t.isVariableDeclaration(stmt)) {
    const names = stmt.declarations
      .map((d) => (t.isIdentifier(d.id) ? d.id.name : '…'))
      .join(', ');
    return `Declares ${stmt.kind} ${names}.`;
  }
  if (t.isIfStatement(stmt)) return 'Branches on a top-level condition.';
  if (t.isTryStatement(stmt)) return 'Wraps a top-level block in try/catch.';
  if (t.isForStatement(stmt) || t.isForInStatement(stmt) || t.isForOfStatement(stmt) || t.isWhileStatement(stmt) || t.isDoWhileStatement(stmt)) {
    return 'Runs a top-level loop.';
  }
  if (t.isExpressionStatement(stmt)) {
    const e = stmt.expression;
    if (t.isCallExpression(e)) {
      const callee = e.callee;
      if (t.isIdentifier(callee)) return `Calls ${callee.name}() at top level.`;
      if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) return `Calls ${shortName((callee as t.MemberExpression).object)}.${callee.property.name}() at top level.`;
      if (t.isFunctionExpression(callee) || t.isArrowFunctionExpression(callee)) return 'Runs an IIFE at top level.';
      return 'Calls a function at top level.';
    }
    if (t.isAssignmentExpression(e)) {
      return `Assigns ${shortName(e.left)} = …`;
    }
  }
  if (t.isReturnStatement(stmt)) return 'Returns at top level (likely inside a script body).';
  return null;
}
