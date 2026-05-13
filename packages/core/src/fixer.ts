import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { parse } from '@babel/parser';
import generate from '@babel/generator';

export function fixMagicNumbers(code: string): string {
  const ast = parse(code, {
    sourceType: 'unambiguous',
    plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties'],
  });

  const magicNumbers = new Map<number, string>();
  let count = 0;

  traverse(ast, {
    NumericLiteral(p) {
      const v = p.node.value;
      if (v !== 0 && v !== 1 && v !== -1 && v !== 2 && Math.abs(v) > 1) {
        if (!t.isVariableDeclarator(p.parent) || !t.isIdentifier((p.parent as t.VariableDeclarator).id)) {
          if (!t.isObjectProperty(p.parent)) {
            if (!magicNumbers.has(v)) {
              magicNumbers.set(v, `MAGIC_${++count}_${Math.abs(v)}`);
            }
            p.replaceWith(t.identifier(magicNumbers.get(v)!));
          }
        }
      }
    },
  });

  if (magicNumbers.size === 0) return code;

  const constants = Array.from(magicNumbers.entries())
    .map(([val, name]) => `const ${name} = ${val};`)
    .join('\n');

  const result = generate(ast, { retainLines: true }, code);
  return constants + '\n\n' + result.code;
}
