#!/usr/bin/env bash
# nanoclaw-emit — Lightweight event emitter for NanoClaw's policy engine.
# Usage: nanoclaw-emit <event_type> [payload_json] [source]
#
# Inserts directly into NanoClaw's SQLite DB. Designed to be fast (<50ms).
# Used by BOI hooks, Claude Code hooks, file watchers, manual CLI.

set -euo pipefail

EVENT_TYPE="${1:?Usage: nanoclaw-emit <event_type> [payload_json] [source]}"
PAYLOAD="${2:-{}}"
SOURCE="${3:-unknown}"

# Find the DB. Check env var first, then default location.
NANOCLAW_DB="${NANOCLAW_DB:-$(cd "$(dirname "$0")/.." && pwd)/store/messages.db}"

if [ ! -f "$NANOCLAW_DB" ]; then
  echo "[nanoclaw-emit] ERROR: DB not found at $NANOCLAW_DB" >&2
  exit 1
fi

# Escape single quotes for safe SQLite interpolation.
ESC_TYPE="${EVENT_TYPE//\'/\'\'}"
ESC_PAYLOAD="${PAYLOAD//\'/\'\'}"
ESC_SOURCE="${SOURCE//\'/\'\'}"

sqlite3 "$NANOCLAW_DB" "INSERT INTO events (event_type, payload, source) VALUES ('$ESC_TYPE', '$ESC_PAYLOAD', '$ESC_SOURCE');"

echo "[nanoclaw-emit] Emitted: $EVENT_TYPE (source: $SOURCE)"
