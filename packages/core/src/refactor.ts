import * as t from '@babel/types';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import { AnalysisMode, FileMetrics, CodelyConfig, RefactorSuggestion, FunctionMetrics } from './schema';

export function generateRefactors(
  metrics: FileMetrics,
  mode: AnalysisMode = 'standard',
  config?: CodelyConfig,
  source?: string,
  ast?: t.File,
  locale: string = 'en',
): RefactorSuggestion[] {
  const suggestions: RefactorSuggestion[] = [];
  const fns = metrics.functions;
  const thres = config?.thresholds;

  const cyclomaticLimit = thres?.cyclomatic ?? 10;
  const depthLimit = thres?.maxDepth ?? 4;

  const isKo = locale === 'ko';

  const branchy = fns.filter((f) => f.cyclomatic >= cyclomaticLimit);
  const deep = fns.filter((f) => f.maxDepth >= depthLimit);

  for (const f of branchy) {
    suggestions.push({
      id: `split-function-${f.name}-${f.startLine}`,
      type: 'split-function',
      title: isKo ? '함수 분리 제안' : `Split ${labelOf(f)}`,
      description: isKo
        ? `이 함수는 현재 ${f.cyclomatic}개의 분기를 포함하고 있습니다. 로직을 작고 명확한 여러 함수로 나누는 것을 권장합니다.`
        : `Split ${labelOf(f)} (cyclomatic ${f.cyclomatic}) — extract each decision branch into a small named function.`,
      why: isKo
        ? '한 함수가 너무 많은 조건을 처리하면 흐름을 이해하기 어려워지고 실수가 발생하기 쉽습니다. 역할을 분리하면 코드를 더 읽기 쉬워집니다.'
        : 'High cyclomatic complexity makes functions hard to test and reason about. Extracting branches into helpers improves modularity.',
      range: {
        startLine: f.startLine,
        startColumn: 1,
        endLine: f.endLine,
        endColumn: 100,
      },
    });
  }

  for (const f of deep) {
    const guardRefactor = ast && source ? tryGenerateGuardClause(f, ast, source, isKo) : null;

    if (guardRefactor) {
      suggestions.push({
        id: `guard-clause-${f.name}-${f.startLine}`,
        type: 'guard-clause',
        title: isKo ? '가드 클로저 도입' : `Add Guard Clause to ${labelOf(f)}`,
        description: isKo
          ? '중첩된 조건문을 가드 클로저로 변경하여 코드의 깊이를 줄일 수 있습니다.'
          : `Flatten ${labelOf(f)} using guard clauses to reduce nesting depth (${f.maxDepth}).`,
        why: isKo
          ? '가드 클로저를 사용하면 예외 케이스를 먼저 처리하고 메인 로직에 집중할 수 있어 인지 부하가 크게 줄어듭니다.'
          : 'Guard clauses handle edge cases early, keeping the main logic at a lower indentation level.',
        range: {
          startLine: f.startLine,
          startColumn: 1,
          endLine: f.endLine,
          endColumn: 100,
        },
        originalCode: guardRefactor.original,
        refactoredCode: guardRefactor.refactored,
      });
    } else {
      suggestions.push({
        id: `reduce-nesting-${f.name}-${f.startLine}`,
        type: 'reduce-nesting',
        title: isKo ? '중첩 구조 개선' : `Reduce nesting in ${labelOf(f)}`,
        description: isKo
          ? `이 함수는 최대 중첩 깊이가 ${f.maxDepth}에 달합니다. 조기 반환(Early Return) 등을 활용하여 구조를 단순화할 수 있습니다.`
          : `This function has a nesting depth of ${f.maxDepth}. Consider flattening it for better readability.`,
        why: isKo
          ? '깊은 중첩은 코드를 읽는 사람이 현재 어떤 조건 안에 있는지 계속 기억해야 하므로 인지 피로도를 높입니다.'
          : 'Deep nesting forces the reader to maintain a large mental stack of conditions, increasing cognitive load.',
        range: {
          startLine: f.startLine,
          startColumn: 1,
          endLine: f.endLine,
          endColumn: 100,
        },
      });
    }
  }

  if (ast && source) {
    const conditionalRefactors = findConditionalSimplifications(ast, isKo);
    suggestions.push(...conditionalRefactors);

    const extractVarRefactors = findExtractVariableSuggestions(ast, isKo);
    suggestions.push(...extractVarRefactors);
  }

  if (metrics.poorlyNamedIdentifiers.length >= 2) {
    suggestions.push({
      id: 'rename-ambiguous',
      type: 'rename',
      title: isKo ? '변수명 개선 제안' : 'Rename ambiguous identifiers',
      description: isKo
        ? `현재 코드에 '${metrics.poorlyNamedIdentifiers.slice(0, 3).join("', '")}' 등 의미가 불명확한 이름이 있습니다.`
        : `Rename ambiguous identifiers (${metrics.poorlyNamedIdentifiers.slice(0, 5).join(', ')}).`,
      why: isKo
        ? '명확한 이름은 그 자체로 훌륭한 설명이 됩니다. 데이터의 성격과 역할을 더 잘 드러내는 이름을 선택하면 가독성이 좋아집니다.'
        : 'Variable names should answer "what is this value for?" not "what type is it?".',
      range: {
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      },
    });
  }

  if (mode === 'architect' && metrics.imports.length > 10) {
    suggestions.push({
      id: 'reduce-dependencies',
      type: 'other',
      title: isKo ? '의존성 최적화 제안' : 'Optimize module dependencies',
      description: isKo
        ? `이 파일은 현재 ${metrics.imports.length}개의 모듈을 임포트하고 있습니다. 모듈 결합도가 너무 높을 수 있습니다.`
        : `This file has ${metrics.imports.length} imports — consider splitting the module to reduce coupling.`,
      why: isKo
        ? '너무 많은 임포트는 모듈 간의 강한 결합을 의미하며, 테스트와 유지보수를 어렵게 만듭니다.'
        : 'High fan-in makes modules brittle and hard to test in isolation.',
      range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
    });
  }

  return suggestions;
}

function labelOf(f: { name: string; ownerClass?: string }): string {
  return f.ownerClass ? `${f.ownerClass}.${f.name}` : f.name;
}

function tryGenerateGuardClause(fn: FunctionMetrics, ast: t.File, _source: string, _isKo: boolean) {
  let refactored: string | null = null;
  let original: string | null = null;

  traverse(ast, {
    Function(path) {
      if (path.node.loc?.start.line !== fn.startLine) return;

      const body = path.node.body;
      if (!t.isBlockStatement(body)) return;

      const firstStmt = body.body[0];
      if (t.isIfStatement(firstStmt) && !firstStmt.alternate && t.isBlockStatement(firstStmt.consequent)) {
        // Simple case: if (cond) { ... } -> if (!cond) return; ...
        const cond = firstStmt.test;
        const invertedCond = t.isUnaryExpression(cond) && cond.operator === '!' ? cond.argument : t.unaryExpression('!', cond);
        const guard = t.ifStatement(invertedCond, t.returnStatement());
        
        const newBody = [guard, ...firstStmt.consequent.body];
        
        // Create a copy of the node to modify
        const newNode = t.cloneNode(path.node);
        if ('body' in newNode && t.isBlockStatement(newNode.body)) {
          newNode.body = t.blockStatement(newBody);
        }
        
        refactored = generate(newNode).code;
        original = generate(path.node).code;
      }
    },
  });

  return refactored && original ? { refactored, original } : null;
}

function findConditionalSimplifications(ast: t.File, isKo: boolean): RefactorSuggestion[] {
  const suggestions: RefactorSuggestion[] = [];
  
  traverse(ast, {
    LogicalExpression(path) {
      const { node } = path;
      // Example: !!a && !!b -> !!(a && b) or just simplify double negations
      if (t.isUnaryExpression(node.left) && node.left.operator === '!' && 
          t.isUnaryExpression(node.left.argument) && node.left.argument.operator === '!') {
        // Double negation simplified
        const original = generate(node).code;
        const newNode = t.cloneNode(node);
        if (t.isUnaryExpression(node.left) && t.isUnaryExpression(node.left.argument)) {
          newNode.left = node.left.argument.argument as t.Expression;
        }
        const refactored = generate(newNode).code;
        
        if (original !== refactored && path.node.loc) {
          suggestions.push({
            id: `simplify-cond-${path.node.loc.start.line}-${path.node.loc.start.column}`,
            type: 'simplify-conditional',
            title: isKo ? '조건문 단순화' : 'Simplify conditional',
            description: isKo ? '이중 부정을 제거하여 조건을 더 읽기 쉽게 만들 수 있습니다.' : 'Remove double negation to make the condition easier to read.',
            why: isKo ? '이중 부정은 논리 구조를 한 번 더 꼬아서 생각하게 만듭니다. 긍정문으로 표현하면 이해가 빨라집니다.' : 'Double negations add unnecessary mental overhead when parsing logic.',
            range: {
              startLine: path.node.loc.start.line,
              startColumn: path.node.loc.start.column + 1,
              endLine: path.node.loc.end.line,
              endColumn: path.node.loc.end.column + 1,
            },
            originalCode: original,
            refactoredCode: refactored,
          });
        }
      }
    }
  });
  
  return suggestions;
}

function findExtractVariableSuggestions(ast: t.File, isKo: boolean): RefactorSuggestion[] {
  const suggestions: RefactorSuggestion[] = [];
  
  traverse(ast, {
    BinaryExpression(path) {
      // Very complex binary expressions
      if (path.node.loc && (path.node.loc.end.column - path.node.loc.start.column) > 60) {
        const original = generate(path.node).code;
        const varName = 'isConditionMet'; // Heuristic name
        const refactored = `const ${varName} = ${original};\n`;
        
        suggestions.push({
          id: `extract-var-${path.node.loc.start.line}`,
          type: 'extract-variable',
          title: isKo ? '변수 추출 제안' : 'Extract variable',
          description: isKo ? '복잡한 표현식을 의미 있는 이름을 가진 변수로 추출하는 것을 권장합니다.' : 'Extract complex expression into a named variable.',
          why: isKo ? '긴 표현식에 이름을 붙여주면 코드가 어떤 의도로 작성되었는지 주석 없이도 명확하게 전달할 수 있습니다.' : 'Giving a name to a complex expression documents its intent without needing a comment.',
          range: {
            startLine: path.node.loc.start.line,
            startColumn: path.node.loc.start.column + 1,
            endLine: path.node.loc.end.line,
            endColumn: path.node.loc.end.column + 1,
          },
          originalCode: original,
          refactoredCode: refactored,
        });
      }
    }
  });
  
  return suggestions;
}

