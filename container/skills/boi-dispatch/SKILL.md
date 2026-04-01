---
name: boi-dispatch
description: Dispatch BOI specs from inside a container
---

# BOI Dispatch

Dispatch a BOI spec from inside a NanoClaw container.

## Usage

1. Write the spec to the mounted BOI queue:

```bash
cat > /workspace/boi-queue/my-spec.spec.md << 'SPECEOF'
# My Spec
### t-1: Task title
PENDING

**Spec:** What to do.

**Verify:** How to verify.
SPECEOF
```

2. Trigger dispatch via IPC:

```bash
cat > /workspace/ipc/tasks/dispatch-$(date +%s).json << 'EOF'
{
  "type": "shell_command",
  "command": "bash ~/.boi/boi dispatch ~/.boi/queue/my-spec.spec.md",
  "timeout": 10
}
EOF
```

## Security

Only `bash ~/.boi/boi dispatch` is in the command allowlist.
