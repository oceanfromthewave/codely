import { execSync } from 'child_process';
import * as path from 'path';

/**
 * Lists repo-relative paths (forward slashes) changed vs `baseRef`: working tree + staged.
 * Returns `null` if `git` fails (not a repo, etc.).
 */
export function listGitChangedFiles(repoRoot: string, baseRef: string): string[] | null {
  try {
    const opts = { cwd: repoRoot, encoding: 'utf8' as const, maxBuffer: 32 * 1024 * 1024 };
    const unstaged = execSync(`git diff --name-only "${baseRef}" --`, opts);
    const staged = execSync(`git diff --name-only --cached "${baseRef}" --`, opts);
    const merged = new Set<string>();
    for (const block of [unstaged, staged]) {
      for (const line of block.split(/\r?\n/)) {
        const t = line.trim();
        if (t) merged.add(t.replace(/\\/g, '/'));
      }
    }
    return [...merged];
  } catch {
    return null;
  }
}

/** Absolute paths under `repoRoot` for changed files. */
export function listGitChangedAbsoluteFiles(repoRoot: string, baseRef: string): string[] | null {
  const rel = listGitChangedFiles(repoRoot, baseRef);
  if (rel === null) return null;
  const root = path.resolve(repoRoot);
  return rel.map((r) => path.join(root, r.split('/').join(path.sep)));
}
