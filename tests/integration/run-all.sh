#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

pass=0
fail=0

run_ts() {
  local name="$1"
  local file="$2"
  echo ""
  echo "=== $name ==="
  if npx tsx "$file"; then
    pass=$((pass + 1))
    echo "  Suite: PASSED"
  else
    fail=$((fail + 1))
    echo "  Suite: FAILED"
  fi
}

run_sh() {
  local name="$1"
  local file="$2"
  echo ""
  echo "=== $name ==="
  if bash "$file"; then
    pass=$((pass + 1))
    echo "  Suite: PASSED"
  else
    fail=$((fail + 1))
    echo "  Suite: FAILED"
  fi
}

run_ts "Engine Lifecycle" "$SCRIPT_DIR/test-engine-lifecycle.ts"
run_sh "CLI Emitter" "$SCRIPT_DIR/test-cli-emitter.sh"
run_ts "IPC Emit" "$SCRIPT_DIR/test-ipc-emit.ts"
run_ts "Cross-System Flow" "$SCRIPT_DIR/test-cross-system-flow.ts"

echo ""
echo "=== RESULTS ==="
echo "  Passed: $pass"
echo "  Failed: $fail"
echo ""

exit "$fail"
