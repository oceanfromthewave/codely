import { describe, expect, it } from 'vitest';
import { isFileWideSuppressed, suppressedLinesForDiagnostics } from '../src/suppress';
import { resolveFileSettings } from '../src/config';
import type { CodelyConfig } from '../src/schema';

describe('suppress', () => {
  it('codely-disable-next-line suppresses the following 1-based line', () => {
    const src = ['// setup', '// codely-disable-next-line', 'function evil() {', '}'].join('\n');
    const s = suppressedLinesForDiagnostics(src);
    expect(s.has(3)).toBe(true);
  });

  it('codely-disable-line suppresses the same line', () => {
    const src = 'function ok() {} // codely-disable-line\n';
    const s = suppressedLinesForDiagnostics(src);
    expect(s.has(1)).toBe(true);
  });

  it('codely-disable-file in first lines', () => {
    expect(isFileWideSuppressed('// codely-disable-file\n\nx')).toBe(true);
    expect(isFileWideSuppressed('/* codely-disable-file */\n')).toBe(true);
    expect(isFileWideSuppressed('export const x = 1;\n'.repeat(50) + '// codely-disable-file\n')).toBe(false);
  });
});

describe('resolveFileSettings', () => {
  it('applies first matching path override', () => {
    const cfg: CodelyConfig = {
      thresholds: { cyclomatic: 10, maxDepth: 4, functionLength: 40, fatigueScore: 7 },
      pathOverrides: [
        { pattern: '**/*.test.ts', diagnostics: false, thresholds: { cyclomatic: 99 } },
        { pattern: '**/*.spec.ts', codeLens: false },
      ],
    };
    const a = resolveFileSettings('packages/core/test/foo.test.ts', cfg);
    expect(a.diagnostics).toBe(false);
    expect(a.thresholds.cyclomatic).toBe(99);

    const b = resolveFileSettings('src/app.ts', cfg);
    expect(b.diagnostics).toBe(true);
    expect(b.thresholds.cyclomatic).toBe(10);
  });
});
