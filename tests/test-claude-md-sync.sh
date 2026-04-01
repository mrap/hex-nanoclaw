#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
TARGET="${REPO_DIR}/groups/main/CLAUDE.md"

echo "Testing CLAUDE.md sync..."

# Run sync
bash "${REPO_DIR}/scripts/sync-claude-md.sh"
SYNC_EXIT=$?

if [ "$SYNC_EXIT" -ne 0 ]; then
  echo "FAIL: sync script exited with $SYNC_EXIT"
  exit 1
fi

# Verify target exists
if [ ! -f "$TARGET" ]; then
  echo "FAIL: Target file not created"
  exit 1
fi

ERRORS=0

# Should NOT contain raw home paths
if grep -q '~/mrap-hex/' "$TARGET" 2>/dev/null; then
  echo "FAIL: Found unsubstituted ~/mrap-hex/"
  grep -n '~/mrap-hex/' "$TARGET" | head -3
  ERRORS=$((ERRORS + 1))
fi

if grep -q '~/.boi/' "$TARGET" 2>/dev/null; then
  echo "FAIL: Found unsubstituted ~/.boi/"
  grep -n '~/.boi/' "$TARGET" | head -3
  ERRORS=$((ERRORS + 1))
fi

if grep -q '~/.hex-events/' "$TARGET" 2>/dev/null; then
  echo "FAIL: Found unsubstituted ~/.hex-events/"
  grep -n '~/.hex-events/' "$TARGET" | head -3
  ERRORS=$((ERRORS + 1))
fi

# Should contain container paths
if ! grep -q '/workspace/group/' "$TARGET" 2>/dev/null; then
  echo "FAIL: No /workspace/group/ found"
  ERRORS=$((ERRORS + 1))
fi

# File should be substantial (original is ~36KB)
SIZE=$(wc -c < "$TARGET")
if [ "$SIZE" -lt 10000 ]; then
  echo "FAIL: Target file too small (${SIZE} bytes, expected 10000+)"
  ERRORS=$((ERRORS + 1))
fi

if [ "$ERRORS" -eq 0 ]; then
  echo "PASS: All sync tests passed (${SIZE} bytes)"
else
  echo "FAIL: ${ERRORS} test(s) failed"
  exit 1
fi
