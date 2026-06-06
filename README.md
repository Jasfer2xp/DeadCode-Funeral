# DeadCode Funeral

Schedule your dead code for deletion. Automatically.

Overview
--------
DeadCode Funeral scans a repository for structured "burial" annotations (JSDoc `@funeral`, C# `[DeadCode(...)]`, and Python `@bury`) and can automatically open GitHub PRs to remove expired dead code after verifying it is unused. All deletions are logged to `GRAVEYARD.md`.

Quick start
-----------
Install dependencies and build:

```bash
npm ci
npm run build
```

Run a dry-run scan:

```bash
npx deadcode-funeral scan --path . --dry-run
```

Preview creating PRs for expired items (dry-run):

```bash
npx deadcode-funeral open-pr --path . --dry-run
```

To actually open PRs and issues, provide a GitHub token with sufficient permissions (e.g., `repo` scope) and run:

```bash
export GITHUB_TOKEN=ghp_xxx
npx deadcode-funeral open-pr --path . --token $GITHUB_TOKEN --owner yourOrg --repo yourRepo
```

VS Code extension
-----------------
There's a minimal VS Code extension scaffold in `vscode-extension/`. Install dependencies, compile the extension, and load it into VS Code for a lightweight UX: status bar, hover hints, CodeLens to run scans, and a command to open PRs using a token stored in `deadcodeFuneral.githubToken` setting.

GitHub Action
-------------
Use the built-in action in `.github/workflows/deadcode-funeral.yml` or the local `action/` folder. The workflow installs deps, builds, and runs the action which will:

- Open warning issues for items expiring in N days (default 7)
- Open deletion PRs for expired and unused items

Testing
-------
Run the unit tests (Jest):

```bash
npm test
```

Notes & Safety
--------------
- The tool never silently deletes code — every deletion goes through a PR.
- The PR creator checks the working tree is clean before making commits and aborts if a change would remove a large portion of a file (>50%).
- Tree-sitter is used where available for AST-accurate parsing; robust textual fallbacks are provided so the scanner works even without native parsers installed.

Contributing
------------
Contributions welcome. Start by running tests, then open a PR with changes. See `CHANGELOG.md` for release notes.

