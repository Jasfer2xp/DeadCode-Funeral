# Installing tree-sitter native grammars on Windows

This project optionally uses tree-sitter grammars for AST-accurate removals. On Windows you may need to build native bindings for `tree-sitter` and language grammars (e.g., `tree-sitter-typescript`, `tree-sitter-php`, `tree-sitter-c-sharp`).

Prerequisites
- Node.js 18+ (LTS recommended)
- Python 3.x (for node-gyp)
- Visual Studio Build Tools (C++ workload) or `windows-build-tools`
- `git`

Quick steps (recommended)
1. Install Python and build tools:
   - Download and install Python 3.10+ from https://www.python.org/downloads/windows/
   - Install Visual Studio Build Tools: https://visualstudio.microsoft.com/downloads/ (choose "Build Tools for Visual Studio") and include "Desktop development with C++" workload.

2. Install `windows-build-tools` (optional):
   - Open an elevated PowerShell and run:
     ```powershell
     npm install --global --production windows-build-tools
     ```
   This will install Python and necessary build tools automatically (deprecated for newer Node/npm setups — prefer installing Visual Studio Build Tools manually).

3. Install the optional tree-sitter packages in the project:

```powershell
# from project root
npm install --save optional tree-sitter tree-sitter-cli
npm install --save optional tree-sitter-typescript tree-sitter-php tree-sitter-c-sharp
```

4. If installation fails with `node-gyp` errors, ensure the `python` path and `msbuild` are on PATH. Re-run `npm install` after fixing environment.

Notes and alternatives
- Many CI runners (GitHub-hosted) provide build tools; for local Windows development, installing Visual Studio Build Tools is the most reliable approach.
- If building native modules is difficult, the codebase falls back to textual heuristics — the tree-sitter grammars are optional.

Automation script
- See `scripts/install_treesitter_windows.ps1` for an optional helper script that attempts to install prerequisites and the grammars. Use at your own risk — it requires admin privileges for some steps.
