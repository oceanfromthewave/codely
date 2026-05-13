import * as vscode from 'vscode';
import { getAnalysis, isSupported } from './cache';

const QUICK_FIX = vscode.CodeActionKind.QuickFix;
const REFACTOR = vscode.CodeActionKind.RefactorRewrite;

const CODELY_FILE_ACTION_SELECTOR: vscode.DocumentFilter[] = [
  { language: 'javascript', scheme: 'file' },
  { language: 'typescript', scheme: 'file' },
  { language: 'javascriptreact', scheme: 'file' },
  { language: 'typescriptreact', scheme: 'file' },
  { language: 'vue', scheme: 'file' },
  { language: 'svelte', scheme: 'file' },
  { language: 'astro', scheme: 'file' },
  { language: 'c', scheme: 'file' },
  { language: 'cpp', scheme: 'file' },
  { language: 'cuda-cpp', scheme: 'file' },
  { language: 'csharp', scheme: 'file' },
  { language: 'java', scheme: 'file' },
  { language: 'kotlin', scheme: 'file' },
  { language: 'scala', scheme: 'file' },
  { language: 'groovy', scheme: 'file' },
  { language: 'objective-c', scheme: 'file' },
  { language: 'objective-cpp', scheme: 'file' },
];

export function registerCodelyCodeActions(_context: vscode.ExtensionContext): vscode.Disposable {
  const provider: vscode.CodeActionProvider = {
    provideCodeActions(document, range, _ctx) {
      if (!isSupported(document)) return;

      const actions: vscode.CodeAction[] = [];
      const analysis = getAnalysis(document);
      const suggestions = analysis.report.refactoring_suggestions;

      // Filter suggestions that overlap with the current range
      const relevantSuggestions = suggestions.filter((s) => {
        // Skip ignored suggestions
        // Note: we can't easily access the ignoredSuggestions set from here without exporting it or using a global state
        // For now, let's just assume we want to provide the actions if it's not explicitly ignored in the UI
        const sRange = new vscode.Range(
          s.range.startLine - 1,
          s.range.startColumn - 1,
          s.range.endLine - 1,
          s.range.endColumn - 1,
        );
        return range.intersection(sRange) !== undefined;
      });

      const locale = vscode.workspace.getConfiguration('codely').get<string>('language', 'en');
      const isKo = locale === 'ko';

      for (const s of relevantSuggestions) {
        const previewAction = new vscode.CodeAction(`${isKo ? 'Codely: 리팩터 미리보기' : 'Codely: Preview Refactor'} (${s.title})`, REFACTOR);
        previewAction.command = {
          command: 'codely.previewRefactor',
          title: 'Preview Refactor',
          arguments: [document, s],
        };
        actions.push(previewAction);

        const applyAction = new vscode.CodeAction(`${isKo ? 'Codely: 리팩터 적용' : 'Codely: Apply Refactor'} (${s.title})`, REFACTOR);
        applyAction.command = {
          command: 'codely.applyRefactor',
          title: 'Apply Refactor',
          arguments: [document, s],
        };
        actions.push(applyAction);

        const explainAction = new vscode.CodeAction(`${isKo ? 'Codely: 이유 설명' : 'Codely: Explain Why'} (${s.title})`, REFACTOR);
        explainAction.command = {
          command: 'codely.explainRefactor',
          title: 'Explain Why',
          arguments: [s],
        };
        actions.push(explainAction);

        const ignoreAction = new vscode.CodeAction(`${isKo ? 'Codely: 무시하기' : 'Codely: Ignore'} (${s.title})`, REFACTOR);
        ignoreAction.command = {
          command: 'codely.ignoreRefactor',
          title: 'Ignore',
          arguments: [s.id],
        };
        actions.push(ignoreAction);
      }

      // Existing diagnostic-based actions
      const codely = _ctx.diagnostics.filter((d) => d.source === 'codely');
      if (codely.length > 0) {
        const seenInsert = new Set<number>();
        for (const d of codely) {
          const at = d.range.start.line;
          if (seenInsert.has(at)) continue;
          seenInsert.add(at);
          const a = new vscode.CodeAction('Codely: Insert // codely-disable-next-line above', QUICK_FIX);
          a.diagnostics = [d];
          a.edit = new vscode.WorkspaceEdit();
          a.edit.insert(document.uri, new vscode.Position(at, 0), '// codely-disable-next-line\n');
          actions.push(a);
        }

        const fileAction = new vscode.CodeAction('Codely: Insert // codely-disable-file at top', QUICK_FIX);
        fileAction.diagnostics = codely;
        fileAction.edit = new vscode.WorkspaceEdit();
        fileAction.edit.insert(document.uri, new vscode.Position(0, 0), '// codely-disable-file\n');
        actions.push(fileAction);
      }

      return actions;
    },
  };

  return vscode.languages.registerCodeActionsProvider(CODELY_FILE_ACTION_SELECTOR, provider, {
    providedCodeActionKinds: [REFACTOR, QUICK_FIX],
  });
}
