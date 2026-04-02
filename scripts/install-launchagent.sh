#!/bin/bash
# Install NanoClaw as a macOS LaunchAgent with auto-restart
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_SRC="$REPO_DIR/launchd/com.mrap.nanoclaw.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.mrap.nanoclaw.plist"
NODE_PATH="$(command -v node || echo '/usr/local/bin/node')"

mkdir -p "$REPO_DIR/logs"

# Generate plist with correct paths
sed \
  -e "s|{{REPO_DIR}}|$REPO_DIR|g" \
  -e "s|/usr/local/bin/node|$NODE_PATH|g" \
  "$PLIST_SRC" > "$PLIST_DEST"

# Load it
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"

echo "NanoClaw LaunchAgent installed. It will auto-start on login and restart on crash."
echo "To uninstall: launchctl unload $PLIST_DEST && rm $PLIST_DEST"
