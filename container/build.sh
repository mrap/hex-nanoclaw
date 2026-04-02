#!/bin/bash
# Build NanoClaw agent container images

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

TAG="${1:-latest}"
CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-docker}"
TARGET="${2:-all}"  # all | claude | local

build_claude() {
  echo "Building nanoclaw-agent (Claude / claude-code)..."
  ${CONTAINER_RUNTIME} build -t "nanoclaw-agent:${TAG}" .
  echo "  nanoclaw-agent:${TAG} done"
}

build_local() {
  echo "Building nanoclaw-agent-local (Ollama / Vercel AI SDK)..."
  ${CONTAINER_RUNTIME} build \
    -f agent-runner-local/Dockerfile \
    -t "nanoclaw-agent-local:${TAG}" \
    .
  echo "  nanoclaw-agent-local:${TAG} done"
}

if [[ "${TARGET}" == "all" || "${TARGET}" == "claude" ]]; then
  build_claude
fi

if [[ "${TARGET}" == "all" || "${TARGET}" == "local" ]]; then
  build_local
fi

echo ""
echo "Build complete! Images:"
echo "  nanoclaw-agent:${TAG}       (Claude — all groups except ops)"
echo "  nanoclaw-agent-local:${TAG} (Ollama — ops group, requires Ollama on host)"
echo ""
echo "Smoke test (local model):"
echo "  echo '{\"prompt\":\"What is 2+2?\",\"groupFolder\":\"ops\",\"chatJid\":\"test@g.us\",\"isMain\":false}' \\"
echo "    | ${CONTAINER_RUNTIME} run -i -e LOCAL_MODEL_URL=http://host.docker.internal:11434 -e MODEL_NAME=qwen2.5:32b nanoclaw-agent-local:${TAG}"
