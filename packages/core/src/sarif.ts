import { pathToFileURL } from 'node:url';
import type { CodelyIssue } from './diagnosticIssues';

const SARIF_SCHEMA = 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';

const RULE_HELP = 'https://github.com/oceanfromthewave/codely#readme';

function sarifLevel(v: CodelyIssue['vscodeSeverity']): 'error' | 'warning' | 'note' | 'none' {
  if (v === 'warning') return 'warning';
  return 'note';
}

const RULE_META: Record<string, { name: string; short: string }> = {
  'codely/cyclomatic-very-high': {
    name: 'Very high cyclomatic complexity',
    short: 'Too many branches in one function.',
  },
  'codely/cyclomatic-high': { name: 'High cyclomatic complexity', short: 'Consider splitting the function.' },
  'codely/nesting-deep': { name: 'Deep nesting', short: 'Prefer early returns / guard clauses.' },
  'codely/nesting': { name: 'Elevated nesting depth', short: 'Nesting reaches configured threshold.' },
  'codely/nested-loops': { name: 'Nested loops', short: 'Possible quadratic or worse complexity.' },
  'codely/nested-ternary-warning': { name: 'Deep nested ternaries', short: 'Prefer if/else for readability.' },
  'codely/nested-ternary': { name: 'Nested ternaries', short: 'Ternary nesting is elevated.' },
  'codely/bitwise-heavy': { name: 'Many bitwise operations', short: 'Document intent or use clearer arithmetic.' },
  'codely/bitwise': { name: 'Bitwise operations', short: 'Consider naming intermediate values.' },
  'codely/long-function': { name: 'Long function', short: 'Function may be doing more than one thing.' },
  'codely/many-side-effects': { name: 'Many side effects', short: 'Harder to test in isolation.' },
  'codely/top-level-mutation': { name: 'Top-level mutation', short: 'Globals reduce locality of reasoning.' },
};

export interface SarifFileInput {
  /** Absolute path on disk (used to build file:// URI). */
  absolutePath: string;
  issues: CodelyIssue[];
}

/**
 * Minimal SARIF 2.1.0 log for GitHub Code Scanning and compatible viewers.
 */
export function buildSarif21Log(
  tool: { name: string; version: string; informationUri?: string },
  files: SarifFileInput[],
): Record<string, unknown> {
  const ruleIds = new Set<string>();
  for (const f of files) for (const i of f.issues) ruleIds.add(i.ruleId);

  const rules = [...ruleIds].map((id) => {
    const m = RULE_META[id] ?? { name: id, short: 'Codely finding.' };
    return {
      id,
      name: m.name,
      shortDescription: { text: m.short },
      helpUri: RULE_HELP,
    };
  });

  const results: Record<string, unknown>[] = [];
  for (const file of files) {
    const uri = pathToFileURL(file.absolutePath).href;
    for (const issue of file.issues) {
      results.push({
        ruleId: issue.ruleId,
        level: sarifLevel(issue.vscodeSeverity),
        message: { text: issue.message },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri },
              region: {
                startLine: issue.startLine,
                endLine: issue.endLine,
                startColumn: issue.startColumn,
                endColumn: issue.endColumn,
              },
            },
          },
        ],
      });
    }
  }

  return {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: tool.name,
            version: tool.version,
            ...(tool.informationUri ? { informationUri: tool.informationUri } : {}),
            rules,
          },
        },
        results,
      },
    ],
  };
}
