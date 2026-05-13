import * as fs from 'fs';
import * as path from 'path';
import { CodelyConfig } from './schema';

const DEFAULT_CONFIG: CodelyConfig = {
  thresholds: {
    cyclomatic: 10,
    maxDepth: 4,
    functionLength: 40,
    fatigueScore: 7
  },
  exclude: ['node_modules', 'dist', 'build', '.git'],
  history: {
    enabled: true,
    maxEntries: 50
  }
};

export function loadConfig(rootPath: string): CodelyConfig {
  const configPath = path.join(rootPath, '.codelyrc');
  if (fs.existsSync(configPath)) {
    try {
      const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return mergeConfig(DEFAULT_CONFIG, userConfig);
    } catch (e) {
      console.warn('Failed to parse .codelyrc, using defaults.');
    }
  }
  return DEFAULT_CONFIG;
}

function mergeConfig(base: CodelyConfig, user: any): CodelyConfig {
  return {
    thresholds: { ...base.thresholds, ...user.thresholds },
    exclude: Array.from(new Set([...(base.exclude || []), ...(user.exclude || [])])),
    history: { ...base.history, ...user.history }
  };
}
