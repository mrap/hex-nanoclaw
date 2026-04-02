# NanoClaw Instance Backup Inventory

Generated: 2026-04-01  
Instance: `~/github.com/mrap/hex-nanoclaw`

## Classification Key

| Class | Meaning |
|-------|---------|
| **code** | Already on GitHub — no backup needed |
| **config** | Instance-specific but reproducible from documented setup |
| **secrets** | Must be encrypted at rest before storing anywhere |
| **runtime** | Conversation history, sessions, accumulated state — hard to recreate |
| **derived** | Auto-regenerated at startup or from other files |

## Priority Key

| Priority | Meaning |
|----------|---------|
| **CRITICAL** | Loss = permanent data loss or broken instance |
| **HIGH** | Loss = significant work to recreate |
| **MEDIUM** | Loss = moderate work; instance still bootable |
| **LOW** | Safe to omit; easily regenerated |
| **SKIP** | Already versioned on GitHub or ephemeral |

---

## Inventory Table

### Instance Root: `~/github.com/mrap/hex-nanoclaw/`

| Path | Classification | Size | Backup Priority | Notes |
|------|---------------|------|-----------------|-------|
| `.env` | **secrets** | ~4 KB | CRITICAL | Slack bot tokens, Anthropic API key, container settings. Excluded from git. Must encrypt before backup. |
| `.env.example` | code | 297 B | SKIP | On GitHub. |
| `config/groups.json` | config | 2.1 KB | HIGH | Registered group definitions (JID, folder, trigger patterns). Instance-specific. |
| `config/event-catalog.yaml` | code | 4.3 KB | SKIP | On GitHub. |
| `config/hex.env.example` | code | 409 B | SKIP | On GitHub. |
| `config/mount-allowlist.json` | config | 960 B | MEDIUM | Instance-specific container mount permissions. |
| `config/slack-app-manifest.yaml` | config | 746 B | MEDIUM | Slack app configuration (channels, scopes). |
| `config/policies/boi-completion-notify.yaml` | config | 804 B | HIGH | Runtime policy for BOI task notifications. |
| `config/policies/boi-dispatch-router.yaml` | config | 442 B | HIGH | Runtime policy for BOI dispatch routing. |
| `config/policies/internal-lifecycle.yaml` | config | 342 B | HIGH | Internal lifecycle events policy. |
| `config/policies/session-lifecycle.yaml` | config | 577 B | HIGH | Session lifecycle policy. |
| `config/policies/skill-propagation.yaml` | config | 694 B | HIGH | Skill propagation policy. |
| `store/messages.db` | **runtime** | 80 KB | CRITICAL | Primary SQLite DB. Tables: chats, messages, registered_groups, sessions, scheduled_tasks, task_run_logs, router_state, events, deferred_events, policy_eval_log, action_log, policies. Use `.backup` API for safe snapshot. |
| `store/messages.db-shm` | derived | 32 KB | SKIP | SQLite WAL shared-memory index — auto-recreated. |
| `store/messages.db-wal` | **runtime** | 1.2 MB | CRITICAL | SQLite WAL log — must checkpoint before backup or include with db. |
| `data/sessions/main/.claude/` | runtime | ~100 KB | MEDIUM | Active Claude session files for the main group. Lose these = container must restart a fresh session. |
| `data/sessions/main/agent-runner-src/` | derived | ~36 KB | LOW | Runtime agent source snapshot; regenerated on container start. |
| `data/ipc/main/available_groups.json` | derived | ~659 B | LOW | IPC state populated at runtime. |
| `data/ipc/main/current_tasks.json` | derived | ~2 B | LOW | IPC task state. |
| `data/ipc/main/input/` | derived | — | SKIP | Ephemeral input queue. |
| `data/ipc/main/messages/` | derived | — | SKIP | Ephemeral message queue. |
| `data/ipc/main/tasks/` | derived | — | SKIP | Ephemeral task queue. |
| `groups/main/CLAUDE.md` | config | 41 KB | CRITICAL | Main group's system prompt / instructions. Heavily customised. |
| `groups/main/MEMORY.md` | **runtime** | 82 B | HIGH | Accumulated agent memory for main group. |
| `groups/main/USER.md` | config | 86 B | HIGH | User profile for main group. |
| `groups/main/logs/` | runtime | ~small | LOW | Per-group runtime logs. Informational only. |
| `groups/global/CLAUDE.md` | config | 4.4 KB | HIGH | Global group instructions. |
| `groups/global/MEMORY.md` | **runtime** | 82 B | HIGH | Accumulated memory for global group. |
| `groups/global/USER.md` | config | 86 B | HIGH | User profile for global group. |
| `groups/gws/CLAUDE.md` | config | 2.9 KB | HIGH | GWS group instructions. |
| `groups/gws/MEMORY.md` | **runtime** | 82 B | HIGH | Accumulated memory for gws group. |
| `groups/gws/USER.md` | config | 86 B | HIGH | User profile for gws group. |
| `groups/gws/logs/` | runtime | ~small | LOW | GWS runtime logs. |
| `groups/ops/CLAUDE.md` | config | 3.7 KB | HIGH | Ops group instructions. |
| `groups/ops/MEMORY.md` | **runtime** | 82 B | HIGH | Accumulated memory for ops group. |
| `groups/ops/USER.md` | config | 86 B | HIGH | User profile for ops group. |
| `groups/ops/logs/` | runtime | ~small | LOW | Ops runtime logs. |
| `groups/boi/CLAUDE.md` | config | 3.2 KB | HIGH | BOI group instructions. |
| `groups/boi/MEMORY.md` | **runtime** | 82 B | HIGH | Accumulated memory for boi group. |
| `groups/boi/USER.md` | config | 86 B | HIGH | User profile for boi group. |
| `groups/boi/logs/` | runtime | ~small | LOW | BOI runtime logs. |
| `.claude/settings.json` | config | 3 B | LOW | Local Claude Code settings override. |
| `.claude/skills/` | config | ~varies | MEDIUM | Instance-local skills. May be important if customised beyond global skills. |

### Host-level Config: `~/.config/nanoclaw/`

| Path | Classification | Size | Backup Priority | Notes |
|------|---------------|------|-----------------|-------|
| (directory absent) | — | — | — | `~/.config/nanoclaw/` does not exist on this instance. Spec references `mount-allowlist.json` and `sender-allowlist.json` here, but they are served from `config/` inside the repo instead. No action needed. |

### OneCLI Config: `~/.onecli/`

| Path | Classification | Size | Backup Priority | Notes |
|------|---------------|------|-----------------|-------|
| `~/.onecli/config.json` | config | 43 B | LOW | Just the API host URL (`http://127.0.0.1:10254`). Reproducible. |
| `~/.onecli/docker-compose.yml` | config | 1.1 KB | MEDIUM | Defines Postgres + OneCLI containers, volume names, and port bindings. Needed to reconstruct OneCLI. |
| `~/.onecli/credentials/` | secrets | 0 B (empty dir) | LOW | Credential directory exists but is currently empty — credentials live in Docker volume. |

### OneCLI Docker Volumes

| Volume | Classification | Size | Backup Priority | Notes |
|--------|---------------|------|-----------------|-------|
| `onecli_pgdata` | **secrets** | ~66.8 MB | CRITICAL | Postgres database containing all registered API keys / credentials managed by OneCLI. Loss = must re-register all third-party API keys manually. Export via `docker run --rm -v onecli_pgdata:/data busybox tar czf - /data`. |
| `onecli_app-data` | runtime | ~970 B | MEDIUM | OneCLI app runtime data. Small; export alongside pgdata. |

---

## Summary

| Priority | Items | Total Size |
|----------|-------|-----------|
| CRITICAL | `.env`, `store/messages.db` (+WAL), `onecli_pgdata`, `groups/main/CLAUDE.md` | ~68 MB |
| HIGH | All group `MEMORY.md`/`USER.md`/`CLAUDE.md` files, `config/policies/`, `config/groups.json` | ~55 KB |
| MEDIUM | `config/mount-allowlist.json`, `config/slack-app-manifest.yaml`, `data/sessions/`, `~/.onecli/docker-compose.yml`, `.claude/skills/`, `onecli_app-data` | ~240 KB |
| LOW | `~/.onecli/config.json`, `.claude/settings.json`, group logs | ~5 KB |
| SKIP/DERIVED | `dist/`, `node_modules/`, `store/*.db-shm`, `data/ipc/`, `data/sessions/*/agent-runner-src/`, all code files | N/A |

**Total backup footprint (CRITICAL+HIGH+MEDIUM): ~68.3 MB** (dominated by `onecli_pgdata` at 66.8 MB).

---

## SQLite Schema Summary

`store/messages.db` contains 12 tables:

| Table | Purpose |
|-------|---------|
| `chats` | Known Slack channels/DMs |
| `messages` | Full conversation history |
| `registered_groups` | Active group registrations (JID → folder mapping) |
| `sessions` | Per-group Claude session IDs |
| `scheduled_tasks` | Cron-style recurring tasks |
| `task_run_logs` | Execution log for scheduled tasks |
| `router_state` | Key-value router state |
| `events` | Internal event bus queue |
| `deferred_events` | Future-scheduled events |
| `policy_eval_log` | Policy evaluation audit trail |
| `action_log` | Policy action execution log |
| `policies` | User-defined YAML policies (stored in DB) |

---

## OneCLI Vault Architecture

OneCLI uses a Postgres Docker volume (`onecli_pgdata`) as its credential vault. The service runs at `http://127.0.0.1:10254` (configured in `~/.onecli/config.json`). The `docker-compose.yml` at `~/.onecli/docker-compose.yml` defines both the `postgres:18-alpine` database container and the `ghcr.io/onecli/onecli:latest` app container. API keys registered with OneCLI are stored exclusively in the Postgres volume and are **never** written to disk outside the container. A backup must export this volume using `docker run` with the `busybox` or similar image.

---

## .gitignore Summary (what's excluded from version control)

The following are excluded from git and **require backup**:
- `store/` — all SQLite databases
- `data/` — sessions, IPC state
- `logs/` — runtime logs
- `groups/*` (except listed `CLAUDE.md`, `MEMORY.md`, `USER.md` per group — those **are** tracked)
- `*.keys.json`
- `.env`
- `.nanoclaw/` — local per-installation skills state

**Note:** `groups/*/conversations/` is explicitly excluded even though other group files are included.
