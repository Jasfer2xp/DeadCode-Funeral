"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));
var path = __toESM(require("path"));
function activate(context) {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  status.text = "\u26B0\uFE0F DeadCode Funeral";
  status.show();
  context.subscriptions.push(status);
  const scanCmd = vscode.commands.registerCommand("deadcode-funeral.scanWorkspace", async () => {
    vscode.window.showInformationMessage("DeadCode Funeral: Scanning workspace \u2014 running scanner...");
    try {
      const workspace2 = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
      if (!workspace2) {
        vscode.window.showWarningMessage("Open a workspace to scan for buried items.");
        return;
      }
      const exec = require("child_process").exec;
      const cmd = `npx deadcode-funeral scan --path "${workspace2.uri.fsPath}" --dry-run`;
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          vscode.window.showErrorMessage("Failed to run scanner: " + err.message);
          return;
        }
        vscode.window.showInformationMessage("Scan complete \u2014 check output window for details.");
        const out = vscode.window.createOutputChannel("DeadCode Funeral");
        out.show();
        out.appendLine(stdout);
        if (stderr)
          out.appendLine(stderr);
      });
    } catch (err) {
      vscode.window.showErrorMessage("Error running scan: " + err.message);
    }
  });
  context.subscriptions.push(scanCmd);
  const openPrCmd = vscode.commands.registerCommand("deadcode-funeral.openPr", async () => {
    try {
      const workspace2 = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
      if (!workspace2) {
        vscode.window.showWarningMessage("Open a workspace to run DeadCode Funeral.");
        return;
      }
      let token = await context.secrets.get("deadcodeFuneral.githubToken");
      if (!token)
        token = vscode.workspace.getConfiguration().get("deadcodeFuneral.githubToken");
      if (!token) {
        const pick = await vscode.window.showInformationMessage("No GitHub token configured. Set it now?", "Set Token");
        if (pick === "Set Token")
          vscode.commands.executeCommand("deadcode-funeral.setToken");
        return;
      }
      const out = vscode.window.createOutputChannel("DeadCode Funeral");
      out.show();
      try {
        const scannerPath = path.join(workspace2.uri.fsPath, "dist", "scanner", "index.js");
        const prCreatorPath = path.join(workspace2.uri.fsPath, "dist", "github", "prCreator.js");
        const scannerUrl = "file://" + (process.platform === "win32" ? "/" + scannerPath.replace(/\\/g, "/") : scannerPath);
        const prCreatorUrl = "file://" + (process.platform === "win32" ? "/" + prCreatorPath.replace(/\\/g, "/") : prCreatorPath);
        const scanner = await import(scannerUrl);
        const prCreator = await import(prCreatorUrl);
        out.appendLine("Running in-process scanner...");
        const items = scanner.scan({ root: workspace2.uri.fsPath });
        if (!items || items.length === 0) {
          vscode.window.showInformationMessage("No buried items found in workspace.");
          return;
        }
        const pick = await vscode.window.showQuickPick(["Dry run", "Create PRs (one-by-one)", "Preview diffs"], { placeHolder: `Found ${items.length} buried items. How should DeadCode Funeral proceed?` });
        if (!pick)
          return;
        for (const it of items) {
          out.appendLine(`Item: ${JSON.stringify(it)}`);
          if (pick === "Dry run") {
            out.appendLine("[dry-run] would create PR for " + it.functionName);
          } else if (pick === "Preview diffs") {
            try {
              const src = require("fs").readFileSync(it.filePath, "utf8");
              const newSrc = prCreator.removeBuriedCode(src, it);
              const diff = `--- original
+++ modified
` + (() => {
                const o = src.split("\n");
                const m = newSrc.split("\n");
                const lines = [];
                const max = Math.max(o.length, m.length);
                for (let i = 0; i < max; i++) {
                  if (o[i] === m[i])
                    lines.push(" " + (o[i] || ""));
                  else {
                    if (o[i] !== void 0)
                      lines.push("-" + o[i]);
                    if (m[i] !== void 0)
                      lines.push("+" + m[i]);
                  }
                }
                return lines.join("\n");
              })();
              const left = await vscode.workspace.openTextDocument({ content: src, language: "plaintext" });
              const right = await vscode.workspace.openTextDocument({ content: newSrc, language: "plaintext" });
              await vscode.commands.executeCommand("vscode.diff", left.uri, right.uri, `${path.basename(it.filePath)} \u2014 DeadCode Funeral preview`);
              const create = await vscode.window.showInformationMessage("Create PR for this removal?", "Create PR", "Cancel");
              if (create === "Create PR") {
                out.appendLine("Creating PR for " + it.functionName + "...");
                try {
                  const res = await prCreator.createDeletionPR(it, { githubToken: token, root: workspace2.uri.fsPath, dryRun: false });
                  out.appendLine("PR result: " + JSON.stringify(res));
                  if (res && res.prUrl) {
                    const open = await vscode.window.showInformationMessage("PR created: " + res.prUrl, "Open PR");
                    if (open === "Open PR")
                      vscode.env.openExternal(vscode.Uri.parse(res.prUrl));
                  }
                } catch (err) {
                  out.appendLine("Failed to create PR: " + err.message);
                }
              }
            } catch (err) {
              out.appendLine("Failed to generate diff: " + err.message);
              vscode.window.showErrorMessage("Failed to generate diff: " + err.message);
            }
          } else {
            out.appendLine("Creating PR for " + it.functionName + "...");
            try {
              const res = await prCreator.createDeletionPR(it, { githubToken: token, root: workspace2.uri.fsPath, dryRun: false });
              out.appendLine("PR result: " + JSON.stringify(res));
              if (res && res.prUrl) {
                const open = await vscode.window.showInformationMessage("PR created: " + res.prUrl, "Open PR");
                if (open === "Open PR")
                  vscode.env.openExternal(vscode.Uri.parse(res.prUrl));
              }
            } catch (err) {
              out.appendLine("Failed to create PR: " + err.message);
            }
          }
        }
        vscode.window.showInformationMessage("DeadCode Funeral: open-pr completed. See output for details.");
        return;
      } catch (err) {
        const exec = require("child_process").exec;
        const cmd = `npx deadcode-funeral open-pr --path "${workspace2.uri.fsPath}" --token "${token.replace(/\"/g, '\\"')}"`;
        out.appendLine(`Falling back to CLI: ${cmd}`);
        exec(cmd, (err2, stdout, stderr) => {
          if (err2) {
            out.appendLine("Error: " + err2.message);
            vscode.window.showErrorMessage("Failed to open PRs. See DeadCode Funeral output.");
            return;
          }
          out.appendLine(stdout);
          if (stderr)
            out.appendLine(stderr);
          const m = stdout && stdout.match(/Created PR:\s*(https?:\/\/[^\s]+)/);
          if (m) {
            const url = m[1];
            vscode.window.showInformationMessage("PR created: " + url, "Open PR").then((sel) => {
              if (sel === "Open PR")
                vscode.env.openExternal(vscode.Uri.parse(url));
            });
          } else {
            vscode.window.showInformationMessage("DeadCode Funeral: open-pr completed (see output).");
          }
        });
        return;
      }
    } catch (err) {
      vscode.window.showErrorMessage("Error running open-pr: " + err.message);
    }
  });
  context.subscriptions.push(openPrCmd);
  const setTokenCmd = vscode.commands.registerCommand("deadcode-funeral.setToken", async () => {
    const value = await vscode.window.showInputBox({ prompt: "Enter GitHub token (will be stored securely)", ignoreFocusOut: true, password: true });
    if (value) {
      await context.secrets.store("deadcodeFuneral.githubToken", value);
      vscode.window.showInformationMessage("GitHub token stored securely.");
    }
  });
  context.subscriptions.push(setTokenCmd);
  const hoverProvider = vscode.languages.registerHoverProvider(["typescript", "javascript", "csharp", "python"], {
    provideHover(document, position) {
      const range = document.getWordRangeAtPosition(position, /@funeral|@bury|DeadCode/);
      if (range) {
        const word = document.getText(range);
        return new vscode.Hover(`\u26B0\uFE0F ${word} \u2014 scheduled dead code annotation`);
      }
      return void 0;
    }
  });
  context.subscriptions.push(hoverProvider);
  const diag = vscode.languages.createDiagnosticCollection("deadcode-funeral");
  context.subscriptions.push(diag);
  function refreshDiagnosticsForDocument(document) {
    const diagnostics = [];
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (line.text.includes("@funeral") || line.text.includes("@bury") || line.text.includes("DeadCode")) {
        const range = new vscode.Range(i, 0, i, line.text.length);
        const d = new vscode.Diagnostic(range, "Marked as scheduled dead code \u2014 consider opening a PR to remove or migrate.", vscode.DiagnosticSeverity.Warning);
        d.source = "DeadCode Funeral";
        diagnostics.push(d);
      }
    }
    diag.set(document.uri, diagnostics);
  }
  if (vscode.window.activeTextEditor)
    refreshDiagnosticsForDocument(vscode.window.activeTextEditor.document);
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => refreshDiagnosticsForDocument(e.document)));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor)
      refreshDiagnosticsForDocument(editor.document);
  }));
  class FuneralCodeActionProvider {
    provideCodeActions(document, range) {
      const actions = [];
      const text = document.getText(range);
      if (/@funeral|@bury|DeadCode/.test(text)) {
        const act = new vscode.CodeAction("\u26B0\uFE0F Run DeadCode Funeral: Scan (dry-run)", vscode.CodeActionKind.QuickFix);
        act.command = { command: "deadcode-funeral.scanWorkspace", title: "Scan (dry-run)" };
        actions.push(act);
        const act2 = new vscode.CodeAction("\u26B0\uFE0F Run DeadCode Funeral: Open PR (dry-run)", vscode.CodeActionKind.QuickFix);
        act2.command = { command: "deadcode-funeral.openPr", title: "Open PR (dry-run)" };
        actions.push(act2);
      }
      return actions;
    }
  }
  context.subscriptions.push(vscode.languages.registerCodeActionsProvider(["typescript", "javascript", "csharp", "python"], new FuneralCodeActionProvider()));
  class FuneralCodeLensProvider {
    provideCodeLenses(document) {
      const lenses = [];
      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i);
        if (line.text.includes("@funeral") || line.text.includes("@bury") || line.text.includes("DeadCode")) {
          const range = new vscode.Range(i, 0, i, 0);
          const cmd = {
            title: "\u26B0\uFE0F Scan / Open PR (dry-run)",
            command: "deadcode-funeral.scanWorkspace",
            tooltip: "Run DeadCode Funeral scan and preview PRs (dry-run)"
          };
          lenses.push(new vscode.CodeLens(range, cmd));
        }
      }
      return lenses;
    }
  }
  context.subscriptions.push(vscode.languages.registerCodeLensProvider(["typescript", "javascript", "csharp", "python"], new FuneralCodeLensProvider()));
  const deco = vscode.window.createTextEditorDecorationType({
    borderColor: "rgba(255,165,0,0.6)",
    borderStyle: "solid",
    borderWidth: "0 0 2px 0"
  });
  function refreshDecorations() {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
      return;
    const doc = editor.document;
    const ranges = [];
    for (let i = 0; i < doc.lineCount; i++) {
      const line = doc.lineAt(i);
      if (line.text.includes("@funeral") || line.text.includes("@bury") || line.text.includes("DeadCode")) {
        ranges.push(new vscode.Range(i, 0, i, line.text.length));
      }
    }
    editor.setDecorations(deco, ranges);
  }
  if (vscode.window.activeTextEditor)
    refreshDecorations();
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(refreshDecorations));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(refreshDecorations));
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
