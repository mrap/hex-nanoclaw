# hex-nanoclaw

A personal AI agent system built on NanoClaw — persistent, multi-group, and self-improving.

## What This Is

hex-nanoclaw is a fork of [qwibitai/nanoclaw](https://github.com/qwibitai/nanoclaw) configured to run the "hex" personal agent system. Where upstream NanoClaw is a general-purpose agent framework, this repo wires it up for a specific setup: four specialized agents (main, ops, gws, boi), a policy engine for reactive automation, and BOI for delegating long-running work to background containers.

Each agent runs in an isolated container with its own filesystem access, MCP servers, and CLAUDE.md. Slack is the primary interface.

## Architecture

NanoClaw runs as a Node.js process on the host. Incoming Slack messages are queued per-group, then dispatched to Docker containers — one per group — running Claude Code. Agents communicate back to the host via an IPC directory watched by the main process.

```
Slack (Socket Mode)
      ↓
  Message Loop (SQLite queue)
      ↓
  Group Queue → Container Runner → Docker container
                                         ↓
                                   Claude Code + CLAUDE.md
                                         ↓
                                   IPC watcher → host actions
                                         ↓
                                   Policy Engine → events/tasks
```

**Key files:**

| File | Purpose |
|------|---------|
| `src/index.ts` | Main orchestrator, message loop, scheduler |
| `src/container-runner.ts` | Container spawning, volume mounts, env injection |
| `src/ipc.ts` | IPC watcher — shell commands, task scheduling, skill management |
| `src/policy-engine/engine.ts` | Event-driven ECA policy processing |
| `config/groups.json` | Group definitions — channels, MCP servers, mounts |
| `config/event-catalog.yaml` | Known event types (mounted read-only into all containers) |
| `config/policies/` | YAML policy rules |
| `config/mount-allowlist.json` | Permitted host paths for container mounts |
| `groups/` | Per-group `CLAUDE.md` agent instructions |
| `launchd/com.nanoclaw.plist` | macOS LaunchAgent for auto-start |

## Groups

| Group | Slack Channel | Purpose |
|-------|--------------|---------|
| `main` | `#hex-main` | Primary assistant — conversations, research, task delegation |
| `ops` | `#hex-ops` | System monitoring, maintenance, self-improvement (no user channel) |
| `gws` | `#hex-gws` | Google Workspace — Gmail, Calendar, Drive, Sheets |
| `boi` | `#hex-boi` | Background task execution — long-running specs, git work, Docker |

## Prerequisites

- macOS (Apple Silicon recommended) or Linux
- [OrbStack](https://orbstack.dev) — lighter Docker Desktop replacement (macOS) or Docker (Linux)
- [Claude Code CLI](https://github.com/anthropics/claude-code): `npm install -g @anthropic-ai/claude-code`
- Node.js 20+
- A Slack workspace with a bot app configured (see [SETUP.md](SETUP.md))
- Anthropic API key

## Quick Start

See [SETUP.md](SETUP.md) for full step-by-step instructions. The short version:

```bash
git clone https://github.com/mrap/hex-nanoclaw.git
cd hex-nanoclaw
cp .env.example .env  # fill in tokens
npm install && npm run build
npm start
```

## Configuration

**Groups** — `config/groups.json` defines each group's Slack channel, MCP servers, and host directory mounts. Channel IDs are the main thing to customize.

**Environment** — `.env` holds Slack tokens, Anthropic API key, and container settings. See `.env.example` for all variables.

**Policies** — YAML files in `config/policies/` define event-triggered automations (ECA model: event → conditions → actions). Actions can schedule tasks, emit events, or run allowlisted shell commands.

**Mounts** — `config/mount-allowlist.json` controls which host paths containers can access. All mounts must be in the allowlist.

## Key Concepts

| Term | Meaning |
|------|---------|
| **Landing** | Daily task list in the main agent's workspace, organized by priority tier (L1–L4) |
| **BOI** | Build Order Item — a spec file describing work to be done; dispatched via `boi.dispatch` event and executed by the boi group |
| **IPC** | Inter-process communication — agents write JSON files to `data/ipc/{group}/` to trigger host-side actions (schedule tasks, create skills, emit events, run shell commands) |
| **Policy** | YAML rule: when an event fires, optionally check conditions, then run actions |
| **Memory** | Two bounded stores per agent: `MEMORY.md` (env facts) and `USER.md` (preferences), updated via IPC |
| **Skill** | Reusable agent instruction file (SKILL.md with YAML frontmatter), created and patched via IPC |

## Related Projects

- Upstream: [qwibitai/nanoclaw](https://github.com/qwibitai/nanoclaw)
- Scrim (web UI): coming soon

## License

MIT
