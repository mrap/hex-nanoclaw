#!/usr/bin/env bash
set -uo pipefail

# Syncs hex's CLAUDE.md to NanoClaw's groups/main/CLAUDE.md
# with path substitutions for container mount points.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
SOURCE="${HOME}/mrap-hex/CLAUDE.md"
TARGET="${REPO_DIR}/groups/main/CLAUDE.md"

if [ ! -f "$SOURCE" ]; then
  echo "ERROR: Source CLAUDE.md not found at $SOURCE" >&2
  exit 1
fi

mkdir -p "$(dirname "$TARGET")"

# Copy and substitute paths
sed \
  -e "s|~/mrap-hex/|/workspace/group/|g" \
  -e 's|\$HOME/mrap-hex/|/workspace/group/|g' \
  -e 's|\${HOME}/mrap-hex/|/workspace/group/|g' \
  -e "s|~/.boi/|/workspace/boi/|g" \
  -e 's|\$HOME/.boi/|/workspace/boi/|g' \
  -e 's|\${HOME}/.boi/|/workspace/boi/|g' \
  -e "s|~/.hex-events/|/workspace/hex-events/|g" \
  -e 's|\$HOME/.hex-events/|/workspace/hex-events/|g' \
  -e 's|\${HOME}/.hex-events/|/workspace/hex-events/|g' \
  -e 's|\.claude/scripts/|/workspace/group/.claude/scripts/|g' \
  -e 's|\.claude/skills/|/workspace/group/.claude/skills/|g' \
  -e 's|\$(pwd)|/workspace/group|g' \
  -e 's|AGENT_DIR="\$(pwd)"|AGENT_DIR="/workspace/group"|g' \
  "$SOURCE" > "$TARGET"

echo "Synced: $SOURCE -> $TARGET"
echo "  Size: $(wc -c < "$TARGET") bytes"
