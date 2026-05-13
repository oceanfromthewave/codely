import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { buildSarif21Log, collectProjectCodelyIssues } from '@codely/core';

export function registerExportSarif(_context: vscode.ExtensionContext, appVersion: string): vscode.Disposable {
  return vscode.commands.registerCommand('codely.exportSarifWorkspace', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showWarningMessage('Codely: open a workspace folder first.');
      return;
    }
    const defaultName = 'codely-results.sarif';
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(folder.uri, defaultName),
      filters: { SARIF: ['sarif', 'json'] },
      saveLabel: 'Export SARIF',
    });
    if (!uri) return;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Codely: building SARIF…',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 0, message: folder.uri.fsPath });
        const fileIssues = collectProjectCodelyIssues(folder.uri.fsPath);
        const log = buildSarif21Log(
          {
            name: 'codely',
            version: appVersion,
            informationUri: 'https://github.com/oceanfromthewave/codely',
          },
          fileIssues.map((f) => ({ absolutePath: f.absolutePath, issues: f.issues })),
        );
        fs.writeFileSync(uri.fsPath, JSON.stringify(log, null, 2) + '\n');
        const n = fileIssues.reduce((a, f) => a + f.issues.length, 0);
        vscode.window.showInformationMessage(
          `Codely: wrote SARIF (${n} results in ${fileIssues.length} files) → ${path.basename(uri.fsPath)}`,
        );
      },
    );
  });
}
