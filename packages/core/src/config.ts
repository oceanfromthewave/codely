import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { CodelyConfig } from './schema';

const DEFAULT_CONFIG: CodelyConfig = {
  thresholds: {
    cyclomatic: 10,
    maxDepth: 4,
    functionLength: 40,
    fatigueScore: 7,
  },
  exclude: ['node_modules', 'dist', 'build', '.git'],
  history: {
    enabled: true,
    maxEntries: 50,
  },
  pathOverrides: [],
};

export interface ResolvedFileSettings {
  thresholds: {
    cyclomatic: number;
    maxDepth: number;
    functionLength: number;
    fatigueScore: number;
  };
  diagnostics: boolean;
  codeLens: boolean;
}

export function loadConfig(rootPath: string): CodelyConfig {
  const configPath = path.join(rootPath, '.codelyrc');
  if (fs.existsSync(configPath)) {
    try {
      const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<CodelyConfig>;
      return mergeConfig(DEFAULT_CONFIG, userConfig);
    } catch {
      console.warn('Failed to parse .codelyrc, using defaults.');
    }
  }
  return DEFAULT_CONFIG;
}

function mergeConfig(base: CodelyConfig, user: Partial<CodelyConfig>): CodelyConfig {
  const baseHistory = base.history ?? { enabled: true, maxEntries: 50 };
  return {
    thresholds: { ...base.thresholds, ...user.thresholds },
    exclude: Array.from(new Set([...(base.exclude || []), ...(user.exclude || [])])),
    history: {
      enabled: user.history?.enabled ?? baseHistory.enabled,
      maxEntries: user.history?.maxEntries ?? baseHistory.maxEntries,
    },
    pathOverrides: user.pathOverrides ?? base.pathOverrides ?? [],
  };
}

function defaultThresholds(config: CodelyConfig): ResolvedFileSettings['thresholds'] {
  const d = DEFAULT_CONFIG.thresholds!;
  return {
    cyclomatic: config.thresholds?.cyclomatic ?? d.cyclomatic!,
    maxDepth: config.thresholds?.maxDepth ?? d.maxDepth!,
    functionLength: config.thresholds?.functionLength ?? d.functionLength!,
    fatigueScore: config.thresholds?.fatigueScore ?? d.fatigueScore!,
  };
}

/**
 * Per-file settings: first matching `pathOverrides[].pattern` (minimatch) wins.
 * `relativePathPosix` is relative to the project root with `/` separators.
 */
export function resolveFileSettings(relativePathPosix: string, config: CodelyConfig): ResolvedFileSettings {
  let thresholds = defaultThresholds(config);
  let diagnostics = true;
  let codeLens = true;
  const norm = relativePathPosix.split(path.sep).join('/');
  for (const ov of config.pathOverrides ?? []) {
    if (minimatch(norm, ov.pattern, { dot: true })) {
      thresholds = {
        cyclomatic: ov.thresholds?.cyclomatic ?? thresholds.cyclomatic,
        maxDepth: ov.thresholds?.maxDepth ?? thresholds.maxDepth,
        functionLength: ov.thresholds?.functionLength ?? thresholds.functionLength,
        fatigueScore: ov.thresholds?.fatigueScore ?? thresholds.fatigueScore,
      };
      if (ov.diagnostics === false) diagnostics = false;
      if (ov.codeLens === false) codeLens = false;
      break;
    }
  }
  return { thresholds, diagnostics, codeLens };
}
