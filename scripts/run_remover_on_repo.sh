#!/usr/bin/env bash
# Clone a repository and run the diff generator against it (for offline E2E testing)
set -euo pipefail
if [ -z "${1-}" ]; then
  echo "Usage: $0 <git-repo-url> [out-dir]"
  exit 1
fi
REPO=$1
OUT=${2-"out/remote-diffs"}
TMP=$(mktemp -d)
echo "Cloning $REPO into $TMP"
 git clone --depth 1 "$REPO" "$TMP/repo"
 node scripts/generate_removal_diffs.cjs "$TMP/repo" "$OUT"
 echo "Diffs written to $OUT"
