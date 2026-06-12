# Helper script to attempt installing tree-sitter grammars on Windows
# Run as Administrator if installing Visual Studio Build Tools

Write-Output "Installing optional tree-sitter grammars (may require admin rights)..."

# Ensure npm is available
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error "npm not found. Install Node.js first: https://nodejs.org/"
  exit 1
}

# Install optional build helpers
npm install --global --production windows-build-tools

# Install tree-sitter packages (local project)
npm install --save-optional tree-sitter tree-sitter-cli
npm install --save-optional tree-sitter-typescript tree-sitter-php tree-sitter-c-sharp

Write-Output "Installation steps attempted. If builds failed, consult docs/TREE-SITTER-WINDOWS.md for manual steps."