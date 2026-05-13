import type { FileMetrics } from './schema';

export interface PreparedSource {
  /** Code passed to the parser (possibly extracted from SFC). */
  code: string;
  /** Path hint for Babel plugins (e.g. ends with `.ts`). */
  filenameForParser: string;
  /** Add to 1-based AST line numbers to map back to the original buffer. */
  lineDelta: number;
}

function basename(filepath: string): string {
  const n = filepath.replace(/\\/g, '/').split('/').pop() ?? '';
  return n;
}

function extOf(filepath: string): string {
  const base = basename(filepath);
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i).toLowerCase() : '';
}

function stripKnownExt(name: string): string {
  return name.replace(/\.(vue|svelte|astro)$/i, '');
}

function scriptLangToSyntheticExt(attrs: string): 'ts' | 'tsx' | 'js' | 'jsx' {
  const m = attrs.match(/\blang\s*=\s*["']([^"']+)["']/i);
  const lang = (m?.[1] ?? '').toLowerCase();
  if (lang.includes('tsx')) return 'tsx';
  if (lang === 'ts' || lang === 'typescript') return 'ts';
  if (lang === 'jsx' || lang === 'javascriptreact') return 'jsx';
  if (lang === 'js' || lang === 'javascript' || lang === '') return 'js';
  if (lang.includes('ts')) return 'ts';
  return 'js';
}

function innerStartIndex(full: string, match: RegExpExecArray): number {
  const open = match[0];
  const rel = open.lastIndexOf('>');
  return match.index + rel + 1;
}

function lineDeltaFromIndex(full: string, innerStart: number): number {
  return full.slice(0, innerStart).split('\n').length - 1;
}

function isSkippableScriptAttrs(attrs: string): boolean {
  if (/\bsrc\s*=/i.test(attrs)) return true;
  if (/\btype\s*=\s*["'][^"']*json[^"']*["']/i.test(attrs)) return true;
  return false;
}

function pickLongestScriptBlock(code: string, filepath: string): PreparedSource | undefined {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let best: { body: string; innerStart: number; attrs: string } | undefined;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const attrs = m[1] ?? '';
    if (isSkippableScriptAttrs(attrs)) continue;
    const body = m[2] ?? '';
    if (!body.trim()) continue;
    const innerStart = innerStartIndex(code, m);
    if (!best || body.length > best.body.length) best = { body, innerStart, attrs };
  }
  if (!best) return undefined;
  const ext = scriptLangToSyntheticExt(best.attrs);
  const stem = stripKnownExt(basename(filepath)) || 'module';
  const filenameForParser = `${stem}.codely.${ext}`;
  const lineDelta = lineDeltaFromIndex(code, best.innerStart);
  return { code: best.body, filenameForParser, lineDelta };
}

function extractVue(code: string, filepath: string): PreparedSource {
  const hit = pickLongestScriptBlock(code, filepath);
  if (hit) return hit;
  return { code, filenameForParser: filepath, lineDelta: 0 };
}

function extractSvelte(code: string, filepath: string): PreparedSource {
  const hit = pickLongestScriptBlock(code, filepath);
  if (hit) return hit;
  return { code, filenameForParser: filepath, lineDelta: 0 };
}

function extractAstro(code: string, filepath: string): PreparedSource {
  let best: PreparedSource | undefined;

  if (code.startsWith('---')) {
    const afterOpen = code.indexOf('\n');
    if (afterOpen !== -1) {
      const close = code.indexOf('\n---', afterOpen + 1);
      if (close !== -1) {
        const innerStart = afterOpen + 1;
        const body = code.slice(innerStart, close);
        if (body.trim().length > 0) {
          const stem = stripKnownExt(basename(filepath)) || 'page';
          best = {
            code: body,
            filenameForParser: `${stem}.codely.ts`,
            lineDelta: lineDeltaFromIndex(code, innerStart),
          };
        }
      }
    }
  }

  const scriptHit = pickLongestScriptBlock(code, filepath);
  if (scriptHit && scriptHit.code.trim().length > 0) {
    if (!best || scriptHit.code.length > best.code.length) best = scriptHit;
  }

  if (best) return best;
  return { code, filenameForParser: filepath, lineDelta: 0 };
}

/**
 * When the buffer is a Vue/Svelte/Astro SFC, extract the main script/frontmatter
 * and return a synthetic filename so Babel picks the right plugins. `lineDelta`
 * shifts 1-based line numbers from the extracted snippet back to the original file.
 */
export function prepareSourceForAnalysis(code: string, filepath: string, languageId?: string): PreparedSource {
  const id = (languageId ?? '').toLowerCase();
  const ext = extOf(filepath);
  const isVue = id === 'vue' || ext === '.vue';
  const isSvelte = id === 'svelte' || ext === '.svelte';
  const isAstro = id === 'astro' || ext === '.astro';

  if (isVue) return extractVue(code, filepath);
  if (isSvelte) return extractSvelte(code, filepath);
  if (isAstro) return extractAstro(code, filepath);

  return { code, filenameForParser: filepath, lineDelta: 0 };
}

export function applyLineDeltaToMetrics(metrics: FileMetrics, lineDelta: number): void {
  if (!lineDelta) return;
  for (const f of metrics.functions) {
    f.startLine += lineDelta;
    f.endLine += lineDelta;
  }
  for (const c of metrics.classes) {
    c.startLine += lineDelta;
    c.endLine += lineDelta;
  }
}
