# hex-nanoclaw Integration Guide

Reference doc for the hex-nanoclaw integration. Covers mounts, IPC, CLAUDE.md sync, and operational procedures.

---

## Overview

hex-nanoclaw is a fork of [qwibitai/nanoclaw](https://github.com/qwibitai/nanoclaw) customized as hex's multi-channel messaging layer. hex needs channels (Telegram, WhatsApp, Slack, Discord) without building channel adapters from scratch. NanoClaw provides battle-tested adapters; this fork wires them to hex's runtime (BOI dispatch, memory search, hex-events IPC).

The fork is additive: hex-specific code is either new files or clearly marked additions. Upstream merges are expected to be clean except in two files (`ipc.ts`, `Dockerfile`).

---

## Filesystem Mounts

Containers get access to host paths via read-only or read-write mounts. The allowlist at `config/mount-allowlist.json` gates which host paths may be mounted.

| Host Path | Container Path | Access | Purpose |
|-----------|---------------|--------|---------|
| `~/mrap-hex/` | `/workspace/group/` | read-write | hex repo (CLAUDE.md, scripts, memory) |
| `~/.boi/queue/` | `/workspace/boi-queue/` | read-write | BOI spec drop directory |
| `~/.hex-events/` | `/workspace/hex-events/` | read-only | Event socket dir — emit via IPC only, never direct writes |
| `data/ipc/{group}/` | `/workspace/ipc/` | read-write | NanoClaw-managed IPC scratch space |

**Note:** `~/.hex-events/` is mounted read-only intentionally. Containers must emit events through `hex_emit.py` (an allowed IPC command), not by writing to the socket directory directly.

---

## IPC shell_command Allowlist

NanoClaw's `shell_command` IPC type lets container skills run host commands. hex uses this for coordination. Only explicitly allowlisted commands execute; everything else is logged and dropped.

### Permitted Commands

| Command | Purpose |
|---------|---------|
| `coordination.py` | Cross-session coordination (lock acquisition, state sync) |
| `boi dispatch <spec>` | Drop a BOI spec into `~/.boi/queue/` |
| `hex_emit.py` | Emit an event to `~/.hex-events/` socket |

### Adding a New Command

1. Open `config/mount-allowlist.json` (or the IPC allowlist config — see `docs/SECURITY.md` for schema).
2. Add the command pattern under `allowedCommands`.
3. Security review required: justify why the command cannot be expressed as a BOI spec instead.
4. Test locally before promoting.

### Blocked Command Behavior

If a container attempts a `shell_command` not in the allowlist:
- The attempt is logged with the full command string.
- The command is **not** executed.
- The skill receives an error response (non-zero exit, message: "command not permitted").
- No silent failures.

---

## CLAUDE.md Sync

hex's `CLAUDE.md` (the agent brain) must be available inside containers with container-correct paths. `scripts/sync-claude-md.sh` copies it and rewrites all host paths to container mount points.

### Path Substitutions

| Host Path Pattern | Container Path |
|-------------------|---------------|
| `~/mrap-hex/` | `/workspace/group/` |
| `~/.boi/` | `/workspace/boi/` |
| `~/.hex-events/` | `/workspace/hex-events/` |
| `.claude/scripts/` | `/workspace/group/.claude/scripts/` |
| `.claude/skills/` | `/workspace/group/.claude/skills/` |
| `$(pwd)` / `AGENT_DIR="$(pwd)"` | `/workspace/group` |

### Running the Sync

```bash
bash scripts/sync-claude-md.sh
```

Output is written to `groups/main/CLAUDE.md`. Re-run whenever `~/mrap-hex/CLAUDE.md` changes.

### When to Re-Run

- After any edit to `~/mrap-hex/CLAUDE.md`
- After adding new scripts or skills that are referenced by path in CLAUDE.md
- Before rebuilding the container image

### Verifying Substitutions

```bash
bash tests/test-claude-md-sync.sh
```

The test checks that no host-style paths (`~/mrap-hex`, `~/.boi`, `$HOME/`, `$(pwd)`) remain in the synced output. Exit 0 = clean.

---

## Hindsight Access from Containers

Hindsight (semantic memory) runs on the host at port 8888. Containers cannot reach `localhost` — they must use `host.docker.internal`.

### Configuration

Set in `.env` (copy from `config/hex.env.example`):

```
HINDSIGHT_URL=http://host.docker.internal:8888
```

### Fallback Behavior

If `HINDSIGHT_URL` is unreachable at startup, memory search falls back to SQLite FTS5 (`/workspace/group/.claude/memory.db`). FTS5 is keyword-only; semantic ranking is unavailable in fallback mode. The agent logs a warning but continues.

### Feature Flag

| Flag | Default | Effect |
|------|---------|--------|
| `HEX_HINDSIGHT` | `1` | Set to `0` to disable Hindsight entirely and force FTS5 |

---

## Adding a Channel

NanoClaw supports channels as skill branches. Each channel (WhatsApp, Telegram, Slack, Discord) lives on a named upstream branch.

### General Procedure

1. Check available upstream branches:
   ```bash
   git fetch upstream
   git branch -r | grep upstream/
   ```
2. Cherry-pick or merge the channel branch onto `main`:
   ```bash
   git merge upstream/channel-telegram
   ```
3. Resolve any conflicts with hex-specific files (`ipc.ts`, `Dockerfile`).
4. Add channel credentials to `.env`.
5. Test locally: `docker compose up` and send a test message.
6. Update `config/mount-allowlist.json` if the channel needs new host paths.

### Reference: Upstream Channel Branches

See `docs/skills-as-branches.md` for the full branch catalog and per-channel setup notes.

---

## Upstream Sync

### Procedure

```bash
git fetch upstream
git merge upstream/main
```

### Expected Conflict Files

| File | hex Modification | Resolution |
|------|-----------------|-----------|
| `ipc.ts` | `shell_command` IPC type with allowlist | Keep hex's additions, take upstream changes around them |
| `Dockerfile` | `python3` install line | Keep the python3 line, take upstream image/layer changes |

All other files should merge cleanly. If conflicts appear outside these two files, investigate before resolving — it may indicate upstream changed something hex depends on.

### After Merging

1. Re-run `bash scripts/sync-claude-md.sh`
2. Run `bash tests/test-claude-md-sync.sh`
3. Rebuild and smoke-test: `docker compose up --build`

---

## Recovery

### Stop NanoClaw Without Affecting hex

```bash
docker compose down
```

hex continues running in terminal mode. No hex files are modified. BOI queue, hex-events socket, and mrap-hex repo are unaffected.

### Revert to Terminal-Only hex

1. `docker compose down`
2. Remove or rename `groups/main/CLAUDE.md` so it's not picked up on next start.
3. hex startup in the terminal uses `~/mrap-hex/CLAUDE.md` directly — no container involvement.

### Feature Flags

| Flag | Effect when `0` |
|------|----------------|
| `HEX_HINDSIGHT` | Disables Hindsight, forces FTS5 memory |
| `MAX_CONCURRENT_CONTAINERS` | Set to `1` to serialize container execution for debugging |

---

## Architecture References

- `~/mrap-hex/me/decisions/next-gen-hex-architecture-2026-03-28.md` — Architecture decision record for next-gen hex
- `~/mrap-hex/raw/research/steelman-path-b.md` — Steelman analysis of the NanoClaw integration path
- `~/mrap-hex/projects/system-improvement/nextgen-working-model.md` — Working model for Phase 2, including hex-nanoclaw's role
