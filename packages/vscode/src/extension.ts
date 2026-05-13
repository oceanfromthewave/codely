import * as vscode from 'vscode';
import { CodelyReport, analyzeWithMetrics, analyzeProject, listGitChangedFiles, RefactorSuggestion } from '@codely/core';
import { ReportPanel } from './panel';
import { getAnalysis, analyzeOptionsForDocument, invalidate, isSupported, clearAll } from './cache';
import { CodelyCodeLensProvider } from './codelens';
import { refreshDiagnostics, getCollection, clear as clearDiag } from './diagnostics';
import { setupStatusBar } from './statusbar';
import { registerCodelyCodeActions } from './codeActions';
import { codelyContextForDocument } from './workspaceContext';
import { registerExportSarif } from './sarifExport';

let lastReport: CodelyReport | undefined;
/** Per-document debounce so switching files does not cancel another file's pending refresh. */
const debounceTimers = new Map<string, NodeJS.Timeout>();

const refactorDecorationType = vscode.window.createTextEditorDecorationType({
  after: {
    margin: '0 0 0 1em',
    contentText: '💡 Codely Refactor Suggestion',
    color: '#3b82f6',
    fontWeight: 'bold',
    fontStyle: 'italic',
  },
});

const ignoredSuggestions = new Set<string>();

class RefactorPreviewProvider implements vscode.TextDocumentContentProvider {
  private _suggestions = new Map<string, string>();

  setSuggestion(id: string, content: string) {
    this._suggestions.set(id, content);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this._suggestions.get(uri.query) ?? '';
  }
}

const previewProvider = new RefactorPreviewProvider();

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('Codely');
  context.subscriptions.push(output);
  const appVersion = String((context.extension.packageJSON as { version?: string }).version ?? '0.0.0');
  const codelens = new CodelyCodeLensProvider();
  const diagnosticCollection = getCollection();
  context.subscriptions.push(diagnosticCollection);

  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('codely-refactor', previewProvider));

  const selector: vscode.DocumentSelector = [
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
    { language: 'javascript', scheme: 'untitled' },
    { language: 'typescript', scheme: 'untitled' },
    { language: 'javascriptreact', scheme: 'untitled' },
    { language: 'typescriptreact', scheme: 'untitled' },
    { language: 'vue', scheme: 'untitled' },
    { language: 'svelte', scheme: 'untitled' },
    { language: 'astro', scheme: 'untitled' },
    { language: 'c', scheme: 'untitled' },
    { language: 'cpp', scheme: 'untitled' },
    { language: 'cuda-cpp', scheme: 'untitled' },
    { language: 'csharp', scheme: 'untitled' },
    { language: 'java', scheme: 'untitled' },
    { language: 'kotlin', scheme: 'untitled' },
    { language: 'scala', scheme: 'untitled' },
    { language: 'groovy', scheme: 'untitled' },
    { language: 'objective-c', scheme: 'untitled' },
    { language: 'objective-cpp', scheme: 'untitled' },
  ];
  context.subscriptions.push(vscode.languages.registerCodeLensProvider(selector, codelens));
  context.subscriptions.push(registerCodelyCodeActions(context));
  context.subscriptions.push(registerExportSarif(context, appVersion));

  const refreshStatus = setupStatusBar(context);

  const refreshDecorations = (editor: vscode.TextEditor) => {
    if (!isSupported(editor.document)) return;
    const { report } = getAnalysis(editor.document);
    const locale = vscode.workspace.getConfiguration('codely').get<string>('language', 'en');
    const isKo = locale === 'ko';

    const decorations: vscode.DecorationOptions[] = report.refactoring_suggestions
      .filter((s) => !ignoredSuggestions.has(s.id))
      .map((s) => ({
        range: new vscode.Range(s.range.startLine - 1, 0, s.range.startLine - 1, 0),
        hoverMessage: new vscode.MarkdownString(
          `### 💡 ${s.title}\n\n${s.description}\n\n---\n\n` +
            `[${isKo ? '미리보기' : 'Preview Refactor'}](command:codely.previewRefactor?${encodeURIComponent(JSON.stringify([editor.document.uri, s]))}) | ` +
            `[${isKo ? '무시하기' : 'Ignore'}](command:codely.ignoreRefactor?${encodeURIComponent(JSON.stringify([s.id]))})`,
        ).appendMarkdown(`\n\n*${s.why}*`),
      }));
    editor.setDecorations(refactorDecorationType, decorations);
  };

  const refresh = (doc: vscode.TextDocument | undefined) => {
    if (!doc || !isSupported(doc)) return;
    try {
      refreshDiagnostics(doc);
      const editor = vscode.window.visibleTextEditors.find((e) => e.document === doc);
      if (editor) refreshDecorations(editor);
    } catch (err: unknown) {
      output.appendLine(
        `[Codely diagnostics error] ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
      );
    }
    codelens.refresh();
    refreshStatus();
  };

  const debouncedRefresh = (doc: vscode.TextDocument) => {
    const key = doc.uri.toString();
    const prev = debounceTimers.get(key);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      debounceTimers.delete(key);
      refresh(doc);
    }, 400);
    debounceTimers.set(key, t);
  };

  const showReport = (editor: vscode.TextEditor) => {
    const code = editor.document.getText();
    if (!code.trim()) {
      vscode.window.showWarningMessage('Codely: no code to analyze.');
      return;
    }
    try {
      const { report } = getAnalysis(editor.document);
      lastReport = report;
      ReportPanel.showOrUpdate(context.extensionUri, report, editor.document.fileName, appVersion);
    } catch (err: unknown) {
      output.appendLine(`[Codely error] ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
      output.show(true);
      vscode.window.showErrorMessage(`Codely failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('codely.previewRefactor', async (docOrUri: vscode.TextDocument | vscode.Uri, suggestion: RefactorSuggestion) => {
      const uri = docOrUri instanceof vscode.Uri ? docOrUri : docOrUri.uri;
      const _document = docOrUri instanceof vscode.Uri ? await vscode.workspace.openTextDocument(docOrUri) : docOrUri;

      if (!suggestion.refactoredCode) {
        vscode.window.showInformationMessage('Codely: refactoring code generation not yet available for this type.');
        return;
      }
      previewProvider.setSuggestion(suggestion.id, suggestion.refactoredCode);
      const previewUri = vscode.Uri.parse(`codely-refactor:${uri.path}?${suggestion.id}`);
      await vscode.commands.executeCommand('vscode.diff', uri, previewUri, `Codely Refactor: ${suggestion.title}`);
    }),

    vscode.commands.registerCommand('codely.ignoreRefactor', (id: string) => {
      ignoredSuggestions.add(id);
      const editor = vscode.window.activeTextEditor;
      if (editor) refreshDecorations(editor);
    }),

    vscode.commands.registerCommand('codely.applyRefactor', async (document: vscode.TextDocument, suggestion: RefactorSuggestion) => {
      if (!suggestion.refactoredCode) return;
      const edit = new vscode.WorkspaceEdit();
      const range = new vscode.Range(
        suggestion.range.startLine - 1,
        suggestion.range.startColumn - 1,
        suggestion.range.endLine - 1,
        suggestion.range.endColumn - 1,
      );
      edit.replace(document.uri, range, suggestion.refactoredCode);
      const success = await vscode.workspace.applyEdit(edit);
      if (success) {
        vscode.window.showInformationMessage(`Codely: Applied refactor "${suggestion.title}"`);
      }
    }),

    vscode.commands.registerCommand('codely.explainRefactor', (suggestion: RefactorSuggestion) => {
      vscode.window.showInformationMessage(`${suggestion.title}\n\n${suggestion.why}`, { modal: true });
    }),

    vscode.commands.registerCommand('codely.analyzeFile', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Codely: open a file first.');
        return;
      }
      showReport(editor);
    }),

    vscode.commands.registerCommand('codely.analyzeSelection', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Codely: open a file first.');
        return;
      }
      const sel = editor.selection;
      if (sel.isEmpty) {
        showReport(editor);
        return;
      }
      const text = editor.document.getText(sel);
      const title = `${editor.document.fileName} (selection L${sel.start.line + 1}-${sel.end.line + 1})`;
      try {
        const baseOpts = analyzeOptionsForDocument(editor.document);
        const { effectiveConfig } = codelyContextForDocument(editor.document);
        const locale = vscode.workspace.getConfiguration('codely').get<string>('language', 'en');
        const { report: selReport } = analyzeWithMetrics(text, {
          ...baseOpts,
          filename: editor.document.fileName,
          languageId: undefined,
          config: effectiveConfig,
          locale,
        });
        lastReport = selReport;
        ReportPanel.showOrUpdate(context.extensionUri, selReport, title, appVersion);
      } catch (err: unknown) {
        output.appendLine(`[Codely error] ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
        output.show(true);
        vscode.window.showErrorMessage(`Codely failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),

    vscode.commands.registerCommand('codely.showRawJson', async () => {
      if (!lastReport) {
        const editor = vscode.window.activeTextEditor;
        if (editor && isSupported(editor.document)) {
          lastReport = getAnalysis(editor.document).report;
        } else {
          vscode.window.showInformationMessage('Codely: open a supported JavaScript/TypeScript file first.');
          return;
        }
      }
      const doc = await vscode.workspace.openTextDocument({
        language: 'json',
        content: JSON.stringify(lastReport, null, 2),
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    }),

    vscode.commands.registerCommand('codely.analyzeGitChanges', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        vscode.window.showWarningMessage('Codely: open a workspace folder first.');
        return;
      }
      const ref = vscode.workspace.getConfiguration('codely').get<string>('gitCompareRef', 'main') ?? 'main';
      const rels = listGitChangedFiles(folder.uri.fsPath, ref);
      if (rels === null) {
        vscode.window.showErrorMessage('Codely: git failed or this folder is not a git repository.');
        return;
      }
      if (rels.length === 0) {
        vscode.window.showInformationMessage(`Codely: no changed files vs ${ref}.`);
        return;
      }
      try {
        const summary = analyzeProject(folder.uri.fsPath, { onlyRelativePaths: new Set(rels) });
        const top = summary.hotspots[0];
        const topStr = top ? `${top.file}:${top.line} ${top.name} (score ${top.score.toFixed(1)})` : 'none';
        const msg = `vs ${ref}: ${summary.totalFiles} files · avg readability ${summary.averageReadability.toFixed(1)}/10 · avg maintainability ${summary.averageMaintainability.toFixed(1)}/10 · top hotspot: ${topStr}`;
        const pick = await vscode.window.showInformationMessage(msg, 'Copy summary JSON');
        if (pick === 'Copy summary JSON') {
          await vscode.env.clipboard.writeText(JSON.stringify(summary, null, 2));
        }
      } catch (err: unknown) {
        output.appendLine(`[Codely git summary error] ${err instanceof Error ? err.message : String(err)}`);
        output.show(true);
        vscode.window.showErrorMessage(`Codely: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),

    vscode.commands.registerCommand(
      'codely.revealFunction',
      async (uri: vscode.Uri, line: number, _name: string, _ownerClass?: string) => {
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        const safeLine = Math.max(0, Math.min(doc.lineCount - 1, line));
        const position = new vscode.Position(safeLine, 0);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        editor.selection = new vscode.Selection(position, position);
        showReport(editor);
      },
    ),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (isSupported(e.document)) {
        invalidate(e.document);
        const typing = vscode.workspace.getConfiguration('codely').get<boolean>('analyzeWhileTyping', true);
        if (typing) debouncedRefresh(e.document);
      }
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (isSupported(doc)) {
        invalidate(doc);
        refresh(doc);
      }
    }),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (isSupported(doc)) refresh(doc);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      invalidate(doc);
      clearDiag(doc.uri);
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) refresh(editor.document);
      else refreshStatus();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('codely')) {
        clearAll();
        codelens.refresh();
        refreshStatus();
        const active = vscode.window.activeTextEditor?.document;
        if (active) refreshDiagnostics(active);
      }
    }),
  );

  if (vscode.window.activeTextEditor) {
    refresh(vscode.window.activeTextEditor.document);
  }
}

export function deactivate() {
  ReportPanel.dispose();
  for (const t of debounceTimers.values()) clearTimeout(t);
  debounceTimers.clear();
}
