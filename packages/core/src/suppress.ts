/**
 * Inline directives (ESLint-style) to reduce noise from Codely diagnostics.
 *
 * - `// codely-disable-next-line` — suppress all Codely diagnostics on the following line.
 * - Same-line `// codely-disable-line` or block form with codely-disable-line — suppress on that line.
 * - `// codely-disable-file` or block disable-file in the first 40 lines — suppress all diagnostics in the file.
 */

const RE_DISABLE_NEXT = /^\s*\/\/\s*codely-disable-next-line\b/;
const RE_DISABLE_LINE = /\/\/\s*codely-disable-line\b|\/\*\s*codely-disable-line\b/;
const RE_DISABLE_FILE = /^\s*\/\/\s*codely-disable-file\b|^\s*\/\*\s*codely-disable-file\b/;

function splitLines(source: string): string[] {
  return source.split(/\r?\n/);
}

/** True if a `codely-disable-file` directive appears in the first `scanLines` lines. */
export function isFileWideSuppressed(source: string, scanLines = 40): boolean {
  const lines = splitLines(source);
  for (let i = 0; i < Math.min(lines.length, scanLines); i++) {
    if (RE_DISABLE_FILE.test(lines[i])) return true;
  }
  return false;
}

/**
 * 1-based line numbers for which function-level / file-level Codely diagnostics should be skipped.
 */
export function suppressedLinesForDiagnostics(source: string): Set<number> {
  const suppressed = new Set<number>();
  const lines = splitLines(source);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i];
    if (RE_DISABLE_NEXT.test(line)) {
      suppressed.add(lineNo + 1);
    }
    if (RE_DISABLE_LINE.test(line)) {
      suppressed.add(lineNo);
    }
  }
  return suppressed;
}
