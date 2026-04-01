---
name: hex-emit
description: Emit events to hex-events from inside a container
---

# Hex Emit

Emit events to hex-events (the policy engine on the host) from inside a NanoClaw container.

## Usage

Write an IPC task file to trigger hex_emit.py on the host:

```bash
cat > /workspace/ipc/tasks/emit-$(date +%s).json << 'EOF'
{
  "type": "shell_command",
  "command": "python3 ~/.hex-events/hex_emit.py agent.action '{\"source\": \"nanoclaw\", \"detail\": \"your event data\"}'",
  "timeout": 5
}
EOF
```

The IPC watcher executes allowlisted commands within 1 second.

## Security

Only `python3 ~/.hex-events/hex_emit.py` is in the command allowlist. Arbitrary commands are blocked.
