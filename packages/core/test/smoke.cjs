'use strict';

const assert = require('node:assert/strict');
const { analyzeWithMetrics } = require('../dist/index.js');

const simple = analyzeWithMetrics('function add(a, b) { return a + b; }', { filename: 'x.ts', mode: 'standard' });
assert.equal(simple.metrics.functions.length, 1);
assert.ok(simple.report.refactoring_suggestions.length >= 1);

const deep = analyzeWithMetrics('function add(a, b) { return a + b; }', { filename: 'x.ts', mode: 'deep' });
assert.equal(deep.metrics.functions.length, simple.metrics.functions.length);
assert.ok(deep.report.refactoring_suggestions.length >= simple.report.refactoring_suggestions.length);

const messy = analyzeWithMetrics(
  'function f(n){ for(let i=0;i<n;i++){ for(let j=0;j<n;j++){ if(n){ if(n){ if(n){ console.log(i); } } } } } }',
  { filename: 'x.js', mode: 'standard' },
);
assert.ok(messy.report.code_fatigue_analysis.fatigue_score >= 1);

const architect = analyzeWithMetrics(
  [...Array(15)].map((_, i) => `import "./m${i}";`).join('\n') + '\nexport const x = 1;\n',
  { filename: 'big-imports.ts', mode: 'architect' },
);
assert.ok(
  architect.report.refactoring_suggestions.some((s) => s.includes('dependencies') || s.includes('imports')),
  'architect mode should surface module-boundary hints when imports are heavy',
);

const vueSfc = analyzeWithMetrics(
  '<template><span /></template>\n<script setup lang="ts">\nfunction foo() { return 1 }\n</script>\n',
  { filename: 'C:\\tmp\\App.vue', languageId: 'vue' },
);
assert.equal(vueSfc.metrics.functions.length, 1);
assert.equal(vueSfc.metrics.functions[0].name, 'foo');
assert.ok(vueSfc.metrics.functions[0].startLine >= 3, 'function line should map into the original SFC');

const mts = analyzeWithMetrics('export const x: number = 1;', { filename: 'mod.mts' });
assert.equal(mts.metrics.functions.length, 0);
assert.ok(mts.metrics.topLevelStatements >= 1);

console.log('smoke tests passed');
