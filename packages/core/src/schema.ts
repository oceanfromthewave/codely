export interface StructurePart {
  part: string;
  responsibility: string;
  logic: string;
}

export interface ComplexityAnalysis {
  time_complexity_estimate: string;
  readability_score: number;
  maintainability_score: number;
}

export interface CodeFatigueAnalysis {
  fatigue_score: number;
  fatigue_reason: string[];
  risk_points: string[];
}

export interface CodelyReport {
  summary: string;
  intent: string;
  high_level_flow: string[];
  structure_breakdown: StructurePart[];
  data_flow: string[];
  complexity_analysis: ComplexityAnalysis;
  code_fatigue_analysis: CodeFatigueAnalysis;
  refactoring_suggestions: string[];
  human_translation: string;
}

export interface AnalyzeFullResult {
  report: CodelyReport;
  metrics: FileMetrics;
}

export type SupportedLanguage =
  | 'auto'
  | 'javascript'
  | 'typescript'
  | 'jsx'
  | 'tsx';

export type AnalysisMode = 'standard' | 'deep' | 'refactor' | 'architect';

export interface AnalyzeOptions {
  language?: SupportedLanguage;
  mode?: AnalysisMode;
  filename?: string;
  /** Editor language id (e.g. `vue`, `svelte`, `astro`) — enables embedded script extraction in the core. */
  languageId?: string;
}

export interface FunctionMetrics {
  name: string;
  kind: 'function' | 'arrow' | 'method' | 'constructor';
  startLine: number;
  endLine: number;
  lengthLines: number;
  params: number;
  cyclomatic: number;
  maxDepth: number;
  ternaryDepth: number;
  bitwiseOps: number;
  isAsync: boolean;
  hasAwait: boolean;
  returnPaths: number;
  sideEffects: string[];
  detectedPatterns: string[];
  loopNesting: number;
  ownerClass?: string;
}

export interface ClassMetrics {
  name: string;
  startLine: number;
  endLine: number;
  methodCount: number;
  hasConstructor: boolean;
  extendsName?: string;
}

export interface FileMetrics {
  totalLines: number;
  nonBlankLines: number;
  commentLines: number;
  topLevelStatements: number;
  imports: string[];
  exports: string[];
  hasDefaultExport: boolean;
  globalAssignments: string[];
  poorlyNamedIdentifiers: string[];
  todoComments: string[];
  magicNumbers: number;
  functions: FunctionMetrics[];
  classes: ClassMetrics[];
  topLevelFlow: string[];
}
