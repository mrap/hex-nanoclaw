# event-emit — Emit Events to the Policy Engine

Emit events from inside a container agent to NanoClaw's policy engine.

## How to Emit

Write a JSON file to your IPC tasks directory:

```bash
cat > /workspace/ipc/tasks/emit-$(date +%s%N).json << 'EOF'
{
  "type": "shell_command",
  "command": "bash ~/github.com/mrap/hex-nanoclaw/scripts/nanoclaw-emit.sh task.completed '{\"group\":\"my-group\",\"result\":\"done\"}' container"
}
EOF
```

## Available Event Types

See `/workspace/event-catalog.yaml` for the full list of known events.

Common events you might emit:
- `task.completed` — You finished an assigned task
- `task.failed` — A task failed
- `review.complete` — You finished reviewing code
- `health.alert` — You detected a problem

## Payload Guidelines

- Always include the `group` field (your group folder name)
- Use string values for all fields
- Keep payloads small (under 1KB)
