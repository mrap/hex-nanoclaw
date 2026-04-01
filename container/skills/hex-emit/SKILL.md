---
name: hex-emit
description: Emit events to the NanoClaw policy engine from inside a container
---

# Hex Emit

Emit events to NanoClaw's policy engine from inside a container.

## How to Emit

Write a JSON file to your IPC tasks directory:

```bash
cat > /workspace/ipc/tasks/emit-$(date +%s%N).json << 'EOF'
{
  "type": "emit_event",
  "event_type": "task.completed",
  "payload": {"group": "my-group", "result": "done"},
  "source": "my-agent"
}
EOF
```

The IPC watcher picks up the file within 1 second and inserts the event into the policy engine's event store.

## Available Event Types

See `/workspace/event-catalog.yaml` for the full list of known events.

Common events you might emit:
- `task.completed` — You finished an assigned task
- `task.failed` — A task failed
- `review.complete` — You finished reviewing code
- `health.alert` — You detected a problem

## Payload Guidelines

- Always include the `group` field (your group folder name)
- Match the types documented in the event catalog
- Keep payloads small (under 1KB)
