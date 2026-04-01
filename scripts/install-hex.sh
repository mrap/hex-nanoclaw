#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

echo "Installing hex-nanoclaw..."

# 1. Install dependencies
echo "  Installing npm dependencies..."
cd "$REPO_DIR" && npm install --silent 2>&1 | tail -3

# 2. Build container image
echo "  Building container image..."
if [ -f "$REPO_DIR/container/build.sh" ]; then
  bash "$REPO_DIR/container/build.sh"
else
  docker build -t nanoclaw-hex -f "$REPO_DIR/container/Dockerfile" "$REPO_DIR/container/"
fi

# 3. Sync CLAUDE.md
echo "  Syncing CLAUDE.md..."
bash "$REPO_DIR/scripts/sync-claude-md.sh"

# 4. Configure mount allowlist
ALLOWLIST_DIR="${HOME}/.config/nanoclaw"
ALLOWLIST_FILE="${ALLOWLIST_DIR}/mount-allowlist.json"
mkdir -p "$ALLOWLIST_DIR"
if [ ! -f "$ALLOWLIST_FILE" ]; then
  cp "$REPO_DIR/config/mount-allowlist.json" "$ALLOWLIST_FILE"
  echo "  Created mount allowlist at $ALLOWLIST_FILE"
  echo "  REVIEW AND ADJUST PATHS before first use!"
else
  echo "  Mount allowlist already exists at $ALLOWLIST_FILE"
fi

# 5. Create .env if needed
if [ ! -f "$REPO_DIR/.env" ]; then
  cp "$REPO_DIR/config/hex.env.example" "$REPO_DIR/.env"
  echo "  Created .env from template — add your ANTHROPIC_API_KEY"
else
  echo "  .env already exists"
fi

# 6. Create data directories
mkdir -p "$REPO_DIR/store" "$REPO_DIR/data" "$REPO_DIR/groups/main"

echo ""
echo "hex-nanoclaw installed."
echo "  Next: edit .env, review ~/.config/nanoclaw/mount-allowlist.json"
