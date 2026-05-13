import * as vscode from 'vscode';
import { isSupported } from './cache';

const QUICK_FIX = vscode.CodeActionKind.QuickFix;

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
    provideCodeActions(document, _range, _ctx) {
      if (!isSupported(document)) return;
      const codely = _ctx.diagnostics.filter((d) => d.source === 'codely');
      if (codely.length === 0) return;

      const actions: vscode.CodeAction[] = [];
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

      return actions;
    },
  };

  return vscode.languages.registerCodeActionsProvider(CODELY_FILE_ACTION_SELECTOR, provider, {
    providedCodeActionKinds: [QUICK_FIX],
  });
}
