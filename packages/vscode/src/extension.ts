import * as vscode from 'vscode';
import { CodelyReport, analyzeWithMetrics } from '@codely/core';
import { ReportPanel } from './panel';
import { getAnalysis, analyzeOptionsForDocument, invalidate, isSupported, clearAll } from './cache';
import { CodelyCodeLensProvider } from './codelens';
import { refreshDiagnostics, getCollection, clear as clearDiag } from './diagnostics';
import { setupStatusBar } from './statusbar';

let lastReport: CodelyReport | undefined;
let debounceTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('Codely');
  const codelens = new CodelyCodeLensProvider();
  const diagnosticCollection = getCollection();
  context.subscriptions.push(diagnosticCollection);

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
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, codelens),
  );

  const refreshStatus = setupStatusBar(context);

  const refresh = (doc: vscode.TextDocument | undefined) => {
    if (!doc || !isSupported(doc)) return;
    try {
      refreshDiagnostics(doc);
    } catch (err: any) {
      output.appendLine(`[Codely diagnostics error] ${err?.stack ?? err}`);
    }
    codelens.refresh();
    refreshStatus();
  };

  const debouncedRefresh = (doc: vscode.TextDocument) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => refresh(doc), 400);
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
      ReportPanel.showOrUpdate(context.extensionUri, report, editor.document.fileName);
    } catch (err: any) {
      output.appendLine(`[Codely error] ${err?.stack ?? err}`);
      output.show(true);
      vscode.window.showErrorMessage(`Codely failed: ${err?.message ?? err}`);
    }
  };

  context.subscriptions.push(
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
        const { report: selReport } = analyzeWithMetrics(text, {
          ...baseOpts,
          filename: editor.document.fileName,
          languageId: undefined,
        });
        lastReport = selReport;
        ReportPanel.showOrUpdate(context.extensionUri, selReport, title);
      } catch (err: any) {
        output.appendLine(`[Codely error] ${err?.stack ?? err}`);
        output.show(true);
        vscode.window.showErrorMessage(`Codely failed: ${err?.message ?? err}`);
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

    vscode.commands.registerCommand(
      'codely.revealFunction',
      async (uri: vscode.Uri, line: number, _name: string, _ownerClass?: string) => {
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        const safeLine = Math.max(0, Math.min(doc.lineCount - 1, line));
        const position = new vscode.Position(safeLine, 0);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenterIfOutsideViewport,
        );
        editor.selection = new vscode.Selection(position, position);
        showReport(editor);
      },
    ),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (isSupported(e.document)) {
        invalidate(e.document);
        debouncedRefresh(e.document);
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
  if (debounceTimer) clearTimeout(debounceTimer);
}
