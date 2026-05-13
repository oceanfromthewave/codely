import { describe, expect, it } from 'vitest';
import { analyzeWithMetrics } from '../src/index';

describe('analyzeWithMetrics', () => {
  it('counts a simple function and yields refactor hints', () => {
    const simple = analyzeWithMetrics('function add(a, b) { return a + b; }', { filename: 'x.ts', mode: 'standard' });
    expect(simple.metrics.functions).toHaveLength(1);
    expect(simple.report.refactoring_suggestions.length).toBeGreaterThanOrEqual(1);
  });

  it('deep mode is at least as rich as standard for the same source', () => {
    const simple = analyzeWithMetrics('function add(a, b) { return a + b; }', { filename: 'x.ts', mode: 'standard' });
    const deep = analyzeWithMetrics('function add(a, b) { return a + b; }', { filename: 'x.ts', mode: 'deep' });
    expect(deep.metrics.functions).toHaveLength(simple.metrics.functions.length);
    expect(deep.report.refactoring_suggestions.length).toBeGreaterThanOrEqual(
      simple.report.refactoring_suggestions.length,
    );
  });

  it('flags high nesting as fatigue', () => {
    const messy = analyzeWithMetrics(
      'function f(n){ for(let i=0;i<n;i++){ for(let j=0;j<n;j++){ if(n){ if(n){ if(n){ console.log(i); } } } } } }',
      { filename: 'x.js', mode: 'standard' },
    );
    expect(messy.report.code_fatigue_analysis.fatigue_score).toBeGreaterThanOrEqual(1);
  });

  it('architect mode surfaces module-boundary hints for heavy imports', () => {
    const architect = analyzeWithMetrics(
      [...Array(15)].map((_, i) => `import "./m${i}";`).join('\n') + '\nexport const x = 1;\n',
      { filename: 'big-imports.ts', mode: 'architect' },
    );
    expect(
      architect.report.refactoring_suggestions.some((s) => s.id.includes('dependencies') || s.id.includes('imports')),
    ).toBe(true);
  });

  it('parses Vue SFC script setup and maps line numbers', () => {
    const vueSfc = analyzeWithMetrics(
      '<template><span /></template>\n<script setup lang="ts">\nfunction foo() { return 1 }\n</script>\n',
      { filename: 'C:\\tmp\\App.vue', languageId: 'vue' },
    );
    expect(vueSfc.metrics.functions).toHaveLength(1);
    expect(vueSfc.metrics.functions[0].name).toBe('foo');
    expect(vueSfc.metrics.functions[0].startLine).toBeGreaterThanOrEqual(3);
  });

  it('handles .mts without falsely counting functions', () => {
    const mts = analyzeWithMetrics('export const x: number = 1;', { filename: 'mod.mts' });
    expect(mts.metrics.functions).toHaveLength(0);
    expect(mts.metrics.topLevelStatements).toBeGreaterThanOrEqual(1);
  });
});
