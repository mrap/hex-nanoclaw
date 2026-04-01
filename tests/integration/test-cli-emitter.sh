#!/usr/bin/env bash
# test-cli-emitter.sh — Integration tests for scripts/nanoclaw-emit.sh
# Usage: bash tests/integration/test-cli-emitter.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EMIT_SCRIPT="$REPO_ROOT/scripts/nanoclaw-emit.sh"

PASS=0
FAIL=0

# ── Helpers ──────────────────────────────────────────────────────────────────

make_db() {
  local db="$1"
  sqlite3 "$db" <<'SQL'
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT,
  dedup_key TEXT
);
SQL
}

pass() { echo "PASS: $1"; ((PASS++)); }
fail() { echo "FAIL: $1 — $2"; ((FAIL++)); }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label"
  else
    fail "$label" "expected='$expected' actual='$actual'"
  fi
}

# ── Test 1: Basic emit ────────────────────────────────────────────────────────

T1_DB="$(mktemp /tmp/nanoclaw-test-XXXXXX.db)"
make_db "$T1_DB"

NANOCLAW_DB="$T1_DB" bash "$EMIT_SCRIPT" "test.basic" '{"key":"value"}' "cli-test" >/dev/null 2>&1

row_count=$(sqlite3 "$T1_DB" "SELECT COUNT(*) FROM events;")
assert_eq "Test 1: row count is 1" "1" "$row_count"

event_type=$(sqlite3 "$T1_DB" "SELECT event_type FROM events LIMIT 1;")
assert_eq "Test 1: event_type is test.basic" "test.basic" "$event_type"

source_val=$(sqlite3 "$T1_DB" "SELECT source FROM events LIMIT 1;")
assert_eq "Test 1: source is cli-test" "cli-test" "$source_val"

payload_val=$(sqlite3 "$T1_DB" "SELECT payload FROM events LIMIT 1;")
assert_eq 'Test 1: payload is {"key":"value"}' '{"key":"value"}' "$payload_val"

rm -f "$T1_DB"

# ── Test 2: Default payload and source ───────────────────────────────────────

T2_DB="$(mktemp /tmp/nanoclaw-test-XXXXXX.db)"
make_db "$T2_DB"

NANOCLAW_DB="$T2_DB" bash "$EMIT_SCRIPT" "test.defaults" >/dev/null 2>&1

payload_val=$(sqlite3 "$T2_DB" "SELECT payload FROM events LIMIT 1;")
assert_eq "Test 2: default payload is {}" "{}" "$payload_val"

source_val=$(sqlite3 "$T2_DB" "SELECT source FROM events LIMIT 1;")
assert_eq "Test 2: default source is unknown" "unknown" "$source_val"

rm -f "$T2_DB"

# ── Test 3: Single quote escaping ─────────────────────────────────────────────

T3_DB="$(mktemp /tmp/nanoclaw-test-XXXXXX.db)"
make_db "$T3_DB"

NANOCLAW_DB="$T3_DB" bash "$EMIT_SCRIPT" "test.quotes" '{"msg":"it'"'"'s safe"}' "cli-test" >/dev/null 2>&1
exit_code=$?

if [[ $exit_code -eq 0 ]]; then
  payload_val=$(sqlite3 "$T3_DB" "SELECT payload FROM events LIMIT 1;")
  assert_eq "Test 3: single quote payload stored correctly" '{"msg":"it'"'"'s safe"}' "$payload_val"
else
  fail "Test 3: single quote escaping" "script exited with code $exit_code"
fi

rm -f "$T3_DB"

# ── Test 4: Missing DB file ───────────────────────────────────────────────────

NANOCLAW_DB="/tmp/nanoclaw-nonexistent-$(date +%s).db" bash "$EMIT_SCRIPT" "test.missing" >/dev/null 2>&1
exit_code=$?

if [[ $exit_code -ne 0 ]]; then
  pass "Test 4: missing DB exits non-zero (exit code $exit_code)"
else
  fail "Test 4: missing DB exits non-zero" "expected non-zero exit, got 0"
fi

# ── Test 5: Help flag ─────────────────────────────────────────────────────────

help_output=$(bash "$EMIT_SCRIPT" --help 2>&1)
if echo "$help_output" | grep -q "Usage"; then
  pass "Test 5: --help output contains 'Usage'"
else
  fail "Test 5: --help output contains 'Usage'" "output was: $help_output"
fi

# ── Test 6: Missing argument ──────────────────────────────────────────────────

bash "$EMIT_SCRIPT" >/dev/null 2>&1
exit_code=$?

if [[ $exit_code -ne 0 ]]; then
  pass "Test 6: no args exits non-zero (exit code $exit_code)"
else
  fail "Test 6: no args exits non-zero" "expected non-zero exit, got 0"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"
exit $FAIL
