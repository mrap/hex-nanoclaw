#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

echo "hex-nanoclaw end-to-end roundtrip test"
echo "======================================="
echo ""

ERRORS=0

# Check 1: Docker is available
echo "Check 1: Docker daemon"
if docker info >/dev/null 2>&1; then
  echo "  PASS"
else
  echo "  FAIL: Docker not running"
  exit 1
fi

# Check 2: Container image exists
echo "Check 2: Container image"
if docker image inspect hex-nanoclaw-test >/dev/null 2>&1; then
  echo "  PASS (hex-nanoclaw-test)"
else
  echo "  Building image..."
  docker build -t hex-nanoclaw-test -f "$REPO_DIR/container/Dockerfile" "$REPO_DIR/container/" >/dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo "  PASS (built)"
  else
    echo "  FAIL: Image build failed"
    exit 1
  fi
fi

# Check 3: Python3 works inside container
echo "Check 3: Python3 in container"
PY_VERSION=$(docker run --rm --entrypoint python3 hex-nanoclaw-test --version 2>&1)
if echo "$PY_VERSION" | grep -q "Python 3"; then
  echo "  PASS ($PY_VERSION)"
else
  echo "  FAIL: $PY_VERSION"
  ERRORS=$((ERRORS + 1))
fi

# Check 4: Hex workspace can be mounted
echo "Check 4: Workspace mount"
if [ -d "$HOME/mrap-hex" ]; then
  MOUNT_TEST=$(docker run --rm \
    -v "$HOME/mrap-hex:/workspace/group:ro" \
    --entrypoint ls \
    hex-nanoclaw-test /workspace/group/CLAUDE.md 2>&1)
  if echo "$MOUNT_TEST" | grep -q "CLAUDE.md"; then
    echo "  PASS (CLAUDE.md visible at /workspace/group/)"
  else
    echo "  FAIL: CLAUDE.md not found in mount"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "  SKIP: ~/mrap-hex not found (expected in non-production test)"
fi

# Check 5: Memory search script accessible via mount
echo "Check 5: Memory search script accessible"
if [ -d "$HOME/mrap-hex" ]; then
  SEARCH_TEST=$(docker run --rm \
    -v "$HOME/mrap-hex:/workspace/group:ro" \
    --entrypoint python3 \
    hex-nanoclaw-test -c "import os; print('EXISTS' if os.path.exists('/workspace/group/.claude/skills/memory/scripts/memory_search.py') else 'MISSING')" 2>&1)
  if echo "$SEARCH_TEST" | grep -q "EXISTS"; then
    echo "  PASS (memory_search.py accessible)"
  else
    echo "  FAIL: memory_search.py not found"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "  SKIP: ~/mrap-hex not found"
fi

# Check 6: Container exits cleanly
echo "Check 6: Clean container exit"
docker run --rm --entrypoint echo hex-nanoclaw-test "clean-exit" >/dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "  PASS"
else
  echo "  FAIL: Container did not exit cleanly"
  ERRORS=$((ERRORS + 1))
fi

echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo "RESULT: All roundtrip tests passed"
else
  echo "RESULT: $ERRORS test(s) failed"
  exit 1
fi
