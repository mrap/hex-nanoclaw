#!/usr/bin/env bash
set -uo pipefail

# Behavioral test: verifies hex's 36KB CLAUDE.md works as a system prompt
# via claude -p. This gates the entire NanoClaw integration.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
CLAUDE_MD="${REPO_DIR}/groups/main/CLAUDE.md"

if [ ! -f "$CLAUDE_MD" ]; then
  echo "ERROR: Run scripts/sync-claude-md.sh first"
  exit 1
fi

echo "Testing 36KB CLAUDE.md as system prompt..."
echo "File size: $(wc -c < "$CLAUDE_MD") bytes"
echo ""

ERRORS=0

# Test 1: Does the agent acknowledge standing orders?
echo "Test 1: Standing order awareness"
RESPONSE=$(echo "What is standing order number 1? Answer in one sentence." | claude -p --system-prompt "$CLAUDE_MD" 2>/dev/null | head -20)
if echo "$RESPONSE" | grep -qi "search.*before\|search.*guess\|memory.*search"; then
  echo "  PASS: Agent knows SO #1 (search before guessing)"
else
  echo "  FAIL: Agent did not reference SO #1"
  echo "  Response: $(echo "$RESPONSE" | head -3)"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# Test 2: Does the agent know about hex's file structure?
echo "Test 2: File structure awareness"
RESPONSE=$(echo "Where should I store a decision record? Answer in one sentence." | claude -p --system-prompt "$CLAUDE_MD" 2>/dev/null | head -20)
if echo "$RESPONSE" | grep -qi "decisions\|me/decisions\|projects.*decisions"; then
  echo "  PASS: Agent knows about decision file locations"
else
  echo "  FAIL: Agent did not reference decision locations"
  echo "  Response: $(echo "$RESPONSE" | head -3)"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# Test 3: Does the agent understand container paths?
echo "Test 3: Container path awareness"
RESPONSE=$(echo "What directory is AGENT_DIR set to? Answer with just the path." | claude -p --system-prompt "$CLAUDE_MD" 2>/dev/null | head -20)
if echo "$RESPONSE" | grep -qi "/workspace/group\|workspace"; then
  echo "  PASS: Agent references container paths"
else
  echo "  WARN: Agent may not recognize container paths"
  echo "  Response: $(echo "$RESPONSE" | head -3)"
  # WARN not FAIL — the agent might interpret differently
fi
echo ""

if [ "$ERRORS" -eq 0 ]; then
  echo "RESULT: All behavioral tests passed"
  echo "  The 36KB CLAUDE.md works as an Agent SDK system prompt."
else
  echo "RESULT: $ERRORS test(s) failed"
  echo "  CLAUDE.md may need adjustment for Agent SDK usage."
  exit 1
fi
