import { describe, expect, it } from 'vitest';
import { collectCodelyIssues } from '../src/diagnosticIssues';
import { buildSarif21Log } from '../src/sarif';
import type { FileMetrics } from '../src/schema';

describe('collectCodelyIssues + SARIF', () => {
  it('emits cyclomatic issue when above threshold', () => {
    const metrics: FileMetrics = {
      totalLines: 10,
      nonBlankLines: 8,
      commentLines: 0,
      topLevelStatements: 1,
      imports: [],
      exports: [],
      hasDefaultExport: false,
      globalAssignments: [],
      poorlyNamedIdentifiers: [],
      todoComments: [],
      magicNumbers: 0,
      functions: [
        {
          name: 'heavy',
          kind: 'function',
          startLine: 1,
          endLine: 5,
          lengthLines: 5,
          params: 2,
          cyclomatic: 12,
          maxDepth: 2,
          ternaryDepth: 0,
          bitwiseOps: 0,
          isAsync: false,
          hasAwait: false,
          returnPaths: 1,
          sideEffects: [],
          detectedPatterns: [],
          loopNesting: 0,
        },
      ],
      classes: [],
      topLevelFlow: [],
    };
    const t = { cyclomatic: 10, maxDepth: 4, functionLength: 40, fatigueScore: 7 };
    const issues = collectCodelyIssues(metrics, t, 'function heavy() {}\n');
    expect(issues.some((i) => i.ruleId === 'codely/cyclomatic-high')).toBe(true);
    const log = buildSarif21Log({ name: 'codely', version: '0.0.0-test' }, [{ absolutePath: '/tmp/x.ts', issues }]);
    expect(log.version).toBe('2.1.0');
    const runs = log.runs as { results: { ruleId: string }[] }[];
    expect(runs[0].results.length).toBeGreaterThanOrEqual(1);
  });
});
