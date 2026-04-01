#!/usr/bin/env bash
# nanoclaw-emit — Lightweight event emitter for NanoClaw's policy engine.
# Usage: nanoclaw-emit <event_type> [payload_json] [source]
#
# Inserts directly into NanoClaw's SQLite DB. Designed to be fast (<50ms).
# Used by BOI hooks, Claude Code hooks, file watchers, manual CLI.

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: nanoclaw-emit <event_type> [payload_json] [source]"
  echo ""
  echo "Emit an event to NanoClaw's policy engine via direct SQLite INSERT."
  echo ""
  echo "Arguments:"
  echo "  event_type    Event type (e.g., boi.spec.completed)"
  echo "  payload_json  JSON payload (default: {})"
  echo "  source        Event source identifier (default: unknown)"
  echo ""
  echo "Environment:"
  echo "  NANOCLAW_DB   Path to NanoClaw's SQLite DB (auto-detected if unset)"
  exit 0
fi

set -euo pipefail

command -v sqlite3 >/dev/null 2>&1 || { echo "[nanoclaw-emit] ERROR: sqlite3 not found on PATH" >&2; exit 1; }

EVENT_TYPE="${1:?Usage: nanoclaw-emit <event_type> [payload_json] [source]}"
_DEFAULT_PAYLOAD='{}'
PAYLOAD="${2:-$_DEFAULT_PAYLOAD}"
SOURCE="${3:-unknown}"

# Find the DB. Check env var first, then default location.
NANOCLAW_DB="${NANOCLAW_DB:-$(cd "$(dirname "$0")/.." && pwd)/store/messages.db}"

if [ ! -f "$NANOCLAW_DB" ]; then
  echo "[nanoclaw-emit] ERROR: DB not found at $NANOCLAW_DB" >&2
  exit 1
fi

# Escape single quotes for safe SQLite interpolation.
# Note: bash replacement strings pass backslashes literally, so we use
# variable-based replacement to produce '' (two single quotes) as SQLite expects.
_SQ="'"
_SQ2="''"
ESC_TYPE="${EVENT_TYPE//$_SQ/$_SQ2}"
ESC_PAYLOAD="${PAYLOAD//$_SQ/$_SQ2}"
ESC_SOURCE="${SOURCE//$_SQ/$_SQ2}"

if ! sqlite3 "$NANOCLAW_DB" <<SQL
.timeout 5000
INSERT INTO events (event_type, payload, source) VALUES ('$ESC_TYPE', '$ESC_PAYLOAD', '$ESC_SOURCE');
SQL
then
  echo "[nanoclaw-emit] ERROR: Failed to insert event '$EVENT_TYPE' into $NANOCLAW_DB" >&2
  exit 1
fi

echo "[nanoclaw-emit] Emitted: $EVENT_TYPE (source: $SOURCE)"
