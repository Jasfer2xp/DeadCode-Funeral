import * as vscode from 'vscode';
import * as path from 'path';

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
      const out = vscode.window.createOutputChannel('DeadCode Funeral');
      out.show();

      // Try to require the workspace scanner and prCreator modules to run in-process and use Octokit
      try {
        const scannerPath = path.join(workspace.uri.fsPath, 'src', 'scanner', 'index.js');
        const prCreatorPath = path.join(workspace.uri.fsPath, 'src', 'github', 'prCreator.js');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const scanner = require(scannerPath);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const prCreator = require(prCreatorPath);

        out.appendLine('Running in-process scanner...');
        const items: any[] = scanner.scan({ root: workspace.uri.fsPath });
        if (!items || items.length === 0) {
          vscode.window.showInformationMessage('No buried items found in workspace.');
          return;
        }

        const pick = await vscode.window.showQuickPick(['Dry run', 'Create PRs (one-by-one)', 'Preview diffs'], { placeHolder: `Found ${items.length} buried items. How should DeadCode Funeral proceed?` });
        if (!pick) return;

        for (const it of items) {
          out.appendLine(`Item: ${JSON.stringify(it)}`);
          if (pick === 'Dry run') {
            out.appendLine('[dry-run] would create PR for ' + it.functionName);
          } else if (pick === 'Preview diffs') {
            // show unified diff in an untitled read-only editor
            try {
              const src = require('fs').readFileSync(it.filePath, 'utf8');
              const newSrc = prCreator.removeBuriedCode(src, it);
              const diff = `--- original\n+++ modified\n` + (() => {
                const o = src.split('\n');
                const m = newSrc.split('\n');
                const lines: string[] = [];
                const max = Math.max(o.length, m.length);
                for (let i = 0; i < max; i++) {
                  if (o[i] === m[i]) lines.push(' ' + (o[i] || ''));
                  else {
                    if (o[i] !== undefined) lines.push('-' + o[i]);
                    if (m[i] !== undefined) lines.push('+' + m[i]);
                  }
                }
                return lines.join('\n');
              })();

              // open two untitled docs and show the side-by-side diff view
              const left = await vscode.workspace.openTextDocument({ content: src, language: 'plaintext' });
              const right = await vscode.workspace.openTextDocument({ content: newSrc, language: 'plaintext' });
              await vscode.commands.executeCommand('vscode.diff', left.uri, right.uri, `${path.basename(it.filePath)} — DeadCode Funeral preview`);

              const create = await vscode.window.showInformationMessage('Create PR for this removal?', 'Create PR', 'Cancel');
              if (create === 'Create PR') {
                out.appendLine('Creating PR for ' + it.functionName + '...');
                try {
                  const res = await prCreator.createDeletionPR(it, { githubToken: token, root: workspace.uri.fsPath, dryRun: false });
                  out.appendLine('PR result: ' + JSON.stringify(res));
                  if (res && res.prUrl) {
                    const open = await vscode.window.showInformationMessage('PR created: ' + res.prUrl, 'Open PR');
                    if (open === 'Open PR') vscode.env.openExternal(vscode.Uri.parse(res.prUrl));
                  }
                } catch (err: any) {
                  out.appendLine('Failed to create PR: ' + err.message);
                }
              }
            } catch (err: any) {
              out.appendLine('Failed to generate diff: ' + err.message);
              vscode.window.showErrorMessage('Failed to generate diff: ' + err.message);
            }
          } else {
            out.appendLine('Creating PR for ' + it.functionName + '...');
            try {
              const res = await prCreator.createDeletionPR(it, { githubToken: token, root: workspace.uri.fsPath, dryRun: false });
              out.appendLine('PR result: ' + JSON.stringify(res));
              if (res && res.prUrl) {
                const open = await vscode.window.showInformationMessage('PR created: ' + res.prUrl, 'Open PR');
                if (open === 'Open PR') vscode.env.openExternal(vscode.Uri.parse(res.prUrl));
              }
            } catch (err: any) {
              out.appendLine('Failed to create PR: ' + err.message);
            }
          }
        }
        vscode.window.showInformationMessage('DeadCode Funeral: open-pr completed. See output for details.');
        return;
      } catch (err: any) {
        // Fallback to CLI if in-process modules not available
        const exec = require('child_process').exec;
        const cmd = `npx deadcode-funeral open-pr --path "${workspace.uri.fsPath}" --token "${token.replace(/\"/g,'\\"')}"`;
        out.appendLine(`Falling back to CLI: ${cmd}`);
        exec(cmd, (err2: any, stdout: string, stderr: string) => {
          if (err2) {
            out.appendLine('Error: ' + err2.message);
            vscode.window.showErrorMessage('Failed to open PRs. See DeadCode Funeral output.');
            return;
          }
          out.appendLine(stdout);
          if (stderr) out.appendLine(stderr);
          const m = stdout && stdout.match(/Created PR:\s*(https?:\/\/[^\s]+)/);
          if (m) {
            const url = m[1];
            vscode.window.showInformationMessage('PR created: ' + url, 'Open PR').then(sel => { if (sel === 'Open PR') vscode.env.openExternal(vscode.Uri.parse(url)); });
          } else {
            vscode.window.showInformationMessage('DeadCode Funeral: open-pr completed (see output).');
          }
        });
        return;
      }
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
