import * as vscode from 'vscode';

// Minimal VS Code extension that registers a scan command and status bar item.
export function activate(context: vscode.ExtensionContext) {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  status.text = '⚰️ DeadCode Funeral';
  status.show();
  context.subscriptions.push(status);

  const scanCmd = vscode.commands.registerCommand('deadcode-funeral.scanWorkspace', async () => {
    vscode.window.showInformationMessage('DeadCode Funeral: Scanning workspace — running scanner...');
    try {
      const workspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
      if (!workspace) {
        vscode.window.showWarningMessage('Open a workspace to scan for buried items.');
        return;
      }
      // Run the CLI scanner as a child process (requires the user to have built the project or installed the package)
      const exec = require('child_process').exec;
      const cmd = `npx deadcode-funeral scan --path "${workspace.uri.fsPath}" --dry-run`;
      exec(cmd, (err: any, stdout: string, stderr: string) => {
        if (err) {
          vscode.window.showErrorMessage('Failed to run scanner: ' + err.message);
          return;
        }
        vscode.window.showInformationMessage('Scan complete — check output window for details.');
        const out = vscode.window.createOutputChannel('DeadCode Funeral');
        out.show();
        out.appendLine(stdout);
        if (stderr) out.appendLine(stderr);
      });
    } catch (err: any) {
      vscode.window.showErrorMessage('Error running scan: ' + err.message);
    }
  });
  context.subscriptions.push(scanCmd);

  const openPrCmd = vscode.commands.registerCommand('deadcode-funeral.openPr', async () => {
    try {
      const workspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
      if (!workspace) {
        vscode.window.showWarningMessage('Open a workspace to run DeadCode Funeral.');
        return;
      }
      // Prefer SecretStorage for token
      let token = await context.secrets.get('deadcodeFuneral.githubToken');
      if (!token) token = vscode.workspace.getConfiguration().get('deadcodeFuneral.githubToken') as string;
      if (!token) {
        const pick = await vscode.window.showInformationMessage('No GitHub token configured. Set it now?', 'Set Token');
        if (pick === 'Set Token') vscode.commands.executeCommand('deadcode-funeral.setToken');
        return;
      }
      const exec = require('child_process').exec;
      const cmd = `npx deadcode-funeral open-pr --path "${workspace.uri.fsPath}" --token "${token.replace(/\"/g,'\\\"')}"`;
      const out = vscode.window.createOutputChannel('DeadCode Funeral');
      out.show();
      out.appendLine(`Running: ${cmd}`);
      exec(cmd, (err: any, stdout: string, stderr: string) => {
        if (err) {
          out.appendLine('Error: ' + err.message);
          vscode.window.showErrorMessage('Failed to open PRs. See DeadCode Funeral output.');
          return;
        }
        out.appendLine(stdout);
        if (stderr) out.appendLine(stderr);
        // Parse PR URL if printed by CLI
        const m = stdout && stdout.match(/Created PR:\s*(https?:\/\/[^\s]+)/);
        if (m) {
          const url = m[1];
          vscode.window.showInformationMessage('PR created: ' + url, 'Open PR').then(sel => { if (sel === 'Open PR') vscode.env.openExternal(vscode.Uri.parse(url)); });
        } else {
          vscode.window.showInformationMessage('DeadCode Funeral: open-pr completed (see output).');
        }
      });
    } catch (err: any) {
      vscode.window.showErrorMessage('Error running open-pr: ' + err.message);
    }
  });
  context.subscriptions.push(openPrCmd);

  const setTokenCmd = vscode.commands.registerCommand('deadcode-funeral.setToken', async () => {
    const value = await vscode.window.showInputBox({ prompt: 'Enter GitHub token (will be stored securely)', ignoreFocusOut: true, password: true });
    if (value) {
      await context.secrets.store('deadcodeFuneral.githubToken', value);
      vscode.window.showInformationMessage('GitHub token stored securely.');
    }
  });
  context.subscriptions.push(setTokenCmd);

  // Provide hover for @funeral comments (very small heuristic)
  const hoverProvider = vscode.languages.registerHoverProvider(['typescript', 'javascript', 'csharp', 'python'], {
    provideHover(document, position) {
      const range = document.getWordRangeAtPosition(position, /@funeral|@bury|DeadCode/);
      if (range) {
        const word = document.getText(range);
        return new vscode.Hover(`⚰️ ${word} — scheduled dead code annotation`);
      }
      return undefined;
    }
  });
  context.subscriptions.push(hoverProvider);

  // Diagnostics: flag buried annotations with a warning diagnostic
  const diag = vscode.languages.createDiagnosticCollection('deadcode-funeral');
  context.subscriptions.push(diag);

  function refreshDiagnosticsForDocument(document: vscode.TextDocument) {
    const diagnostics: vscode.Diagnostic[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (line.text.includes('@funeral') || line.text.includes('@bury') || line.text.includes('DeadCode')) {
        const range = new vscode.Range(i, 0, i, line.text.length);
        const d = new vscode.Diagnostic(range, 'Marked as scheduled dead code — consider opening a PR to remove or migrate.', vscode.DiagnosticSeverity.Warning);
        d.source = 'DeadCode Funeral';
        diagnostics.push(d);
      }
    }
    diag.set(document.uri, diagnostics);
  }

  if (vscode.window.activeTextEditor) refreshDiagnosticsForDocument(vscode.window.activeTextEditor.document);
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => refreshDiagnosticsForDocument(e.document)));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => { if (editor) refreshDiagnosticsForDocument(editor.document); }));

  // Code Action Provider: offer quick action to run scan/open-pr
  class FuneralCodeActionProvider implements vscode.CodeActionProvider {
    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection): vscode.CodeAction[] {
      const actions: vscode.CodeAction[] = [];
      const text = document.getText(range);
      if (/@funeral|@bury|DeadCode/.test(text)) {
        const act = new vscode.CodeAction('⚰️ Run DeadCode Funeral: Scan (dry-run)', vscode.CodeActionKind.QuickFix);
        act.command = { command: 'deadcode-funeral.scanWorkspace', title: 'Scan (dry-run)' };
        actions.push(act);
        const act2 = new vscode.CodeAction('⚰️ Run DeadCode Funeral: Open PR (dry-run)', vscode.CodeActionKind.QuickFix);
        act2.command = { command: 'deadcode-funeral.openPr', title: 'Open PR (dry-run)' };
        actions.push(act2);
      }
      return actions;
    }
  }

  context.subscriptions.push(vscode.languages.registerCodeActionsProvider(['typescript','javascript','csharp','python'], new FuneralCodeActionProvider()));

  // CodeLens provider: show CodeLens above lines containing '@funeral' or '[DeadCode'
  class FuneralCodeLensProvider implements vscode.CodeLensProvider {
    onDidChangeCodeLenses?: vscode.Event<void> | undefined;
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
      const lenses: vscode.CodeLens[] = [];
      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i);
        if (line.text.includes('@funeral') || line.text.includes('@bury') || line.text.includes('DeadCode')) {
          const range = new vscode.Range(i, 0, i, 0);
          const cmd: vscode.Command = {
            title: '⚰️ Scan / Open PR (dry-run)',
            command: 'deadcode-funeral.scanWorkspace',
            tooltip: 'Run DeadCode Funeral scan and preview PRs (dry-run)'
          };
          lenses.push(new vscode.CodeLens(range, cmd));
        }
      }
      return lenses;
    }
  }

  context.subscriptions.push(vscode.languages.registerCodeLensProvider(['typescript','javascript','csharp','python'], new FuneralCodeLensProvider()));

  // Decorations: underline annotations
  const deco = vscode.window.createTextEditorDecorationType({
    borderColor: 'rgba(255,165,0,0.6)',
    borderStyle: 'solid',
    borderWidth: '0 0 2px 0'
  });

  function refreshDecorations() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const doc = editor.document;
    const ranges: vscode.Range[] = [];
    for (let i = 0; i < doc.lineCount; i++) {
      const line = doc.lineAt(i);
      if (line.text.includes('@funeral') || line.text.includes('@bury') || line.text.includes('DeadCode')) {
        ranges.push(new vscode.Range(i, 0, i, line.text.length));
      }
    }
    editor.setDecorations(deco, ranges);
  }

  if (vscode.window.activeTextEditor) refreshDecorations();
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(refreshDecorations));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(refreshDecorations));
}

export function deactivate() {}
