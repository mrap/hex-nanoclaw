# hex-nanoclaw

NanoClaw fork for hex multi-channel messaging. This is NOT production NanoClaw — it is hex's integration layer.

## What This Repo Is

A fork of qwibitai/nanoclaw with hex-specific additions:
- Python3 in container image (for hex memory/emit scripts)
- shell_command IPC type with command allowlist (for BOI dispatch + hex_emit)
- hex container skills (memory-search, hex-emit, boi-dispatch)
- CLAUDE.md sync from hex repo with path substitution
- Mount allowlist for hex filesystem access

## Working Model

Part of next-gen hex Phase 2. See ~/mrap-hex/projects/system-improvement/nextgen-working-model.md.

This repo is developed hermetically — no changes to production hex until validated.

## Upstream Sync

```bash
git fetch upstream
git merge upstream/main
```

Resolve conflicts in hex-specific files only (ipc.ts shell_command, Dockerfile python3 line).

## Constraints

- Never modify production hex files (~/mrap-hex/, ~/.boi/, ~/.hex-events/)
- All hex-specific code is additive (new files or clearly marked additions to existing files)
- stdlib Python only for any Python scripts
- Test everything locally before any promotion to production
