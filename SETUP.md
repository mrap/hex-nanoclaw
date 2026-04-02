# Setting Up hex-nanoclaw

Step-by-step guide for a fresh setup on Mac or Linux.

## Prerequisites

- [ ] **Node.js 20+** — `node --version` to check. Install via [nvm](https://github.com/nvm-sh/nvm) or [nodejs.org](https://nodejs.org)
- [ ] **OrbStack** (macOS) — [orbstack.dev](https://orbstack.dev). Replaces Docker Desktop; lighter and faster. On Linux, install Docker instead.
- [ ] **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`, then `claude login`
- [ ] **Git** — standard, usually pre-installed
- [ ] **Anthropic API key** — from [console.anthropic.com](https://console.anthropic.com)
- [ ] **Slack workspace** — you need admin access to create a bot app

---

## Step 1: Slack Setup

Create a Slack app for the bot.

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From an app manifest**
2. Select your workspace
3. Open `config/slack-app-manifest.yaml` from this repo and paste its contents
4. Review and create the app
5. Under **OAuth & Permissions** → **Install to Workspace** → authorize it
6. Copy the **Bot User OAuth Token** (`xoxb-...`) — this is `SLACK_BOT_TOKEN`
7. Under **Basic Information** → **App-Level Tokens** → **Generate Token** with scope `connections:write`
8. Copy that token (`xapp-...`) — this is `SLACK_APP_TOKEN`
9. Under **Socket Mode** → enable it

**Required bot scopes** (already in the manifest):

| Scope | Purpose |
|-------|---------|
| `channels:history`, `groups:history`, `im:history` | Read messages |
| `channels:read`, `groups:read`, `im:read` | List channels/DMs |
| `chat:write`, `chat:write.customize` | Send messages |
| `channels:join` | Join public channels |
| `reactions:read`, `reactions:write` | Emoji reactions |
| `users:read` | Resolve user info |
| `files:read`, `files:write` | File attachments |

---

## Step 2: Clone and Configure

```bash
git clone https://github.com/mrap/hex-nanoclaw.git
cd hex-nanoclaw
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Bot token from Step 1 (`xoxb-...`) |
| `SLACK_APP_TOKEN` | App-level token from Step 1 (`xapp-...`) |
| `ASSISTANT_NAME` | Bot display name (default: `hex`) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (`sk-ant-...`) |
| `TZ` | Your timezone, e.g. `America/New_York` |
| `GITHUB_TOKEN` | GitHub PAT — needed for BOI git operations |
| `OPENROUTER_API_KEY` | Optional — for routing to non-Claude models |
| `HINDSIGHT_URL` | Optional — semantic memory service, e.g. `http://host.docker.internal:8888` |
| `CONTAINER_TIMEOUT` | Max container run time in ms (default: `3600000` = 1 hour) |
| `IDLE_TIMEOUT` | Container idle cutoff in ms (default: `1800000` = 30 min) |
| `MAX_CONCURRENT_CONTAINERS` | Max parallel group containers (default: `5`) |

---

## Step 3: Configure Your Groups

Edit `config/groups.json`. The structure:

```json
{
  "groups": {
    "main": {
      "name": "hex",
      "folder": "main",
      "channels": { "slack": "hex-main" },
      "isMain": true,
      "mcpServers": { ... },
      "additionalMounts": [ ... ]
    }
  }
}
```

**What to change:**
- `channels.slack` — your Slack channel name (without `#`). The bot will join and respond here.
- `additionalMounts` — host paths to mount into the container. Each entry needs a `hostPath` (absolute or `~/...`), `containerPath` (relative name), and `readonly` flag. All paths must be in `config/mount-allowlist.json`.

**What to leave alone:**
- `folder` — matches the directory name under `groups/` where the CLAUDE.md lives
- `mcpServers` — MCP server configs; add or remove as needed but the format must match

The four default groups and their Slack channels:

| Group | Default channel | Notes |
|-------|----------------|-------|
| `main` | `hex-main` | Primary chat channel |
| `ops` | `hex-ops` | Background ops, no user interaction expected |
| `gws` | `hex-gws` | Google Workspace tasks |
| `boi` | `hex-boi` | Background execution, triggered by events |

---

## Step 4: Set Up Your Workspace

The `main` group mounts `~/mrap-hex` (by default) as the agent's persistent workspace. Create this directory and give it a basic structure:

```bash
mkdir -p ~/mrap-hex/projects
```

The agent will create its own files there (`me.md`, `todo.md`, `landings/`, etc.) as it runs. You can pre-populate `~/mrap-hex/me.md` with relevant context about yourself if you want the agent to know things from day one.

To use a different path, update the `hostPath` in the `main` group's `additionalMounts` in `config/groups.json` and add the new path to `config/mount-allowlist.json`.

---

## Step 5: Build and Start

```bash
npm install
npm run build
npm start
```

Or run in dev mode (no build step):

```bash
npm run dev
```

**macOS auto-start via LaunchAgent:**

```bash
# Install the LaunchAgent (auto-starts NanoClaw on login)
cp launchd/com.nanoclaw.plist ~/Library/LaunchAgents/
# Edit the plist to fill in {{NODE_PATH}} and {{PROJECT_ROOT}}
node -e "console.log(process.execPath)"  # get NODE_PATH
# Then load it:
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
```

Logs go to `logs/nanoclaw.log` and `logs/nanoclaw.error.log`.

---

## Step 6: Verify It's Working

1. Invite the bot to your Slack channels: `/invite @hex` in `#hex-main`
2. Send a message: `hex hello`
3. You should see a typing indicator, then a response within ~30 seconds (first run pulls the Docker image)

Check logs if nothing happens:

```bash
tail -f logs/nanoclaw.log
tail -f logs/nanoclaw.error.log
```

---

## Tailscale Setup (Optional)

Tailscale lets you access NanoClaw running on your Mac from anywhere — no port exposure needed.

```bash
# macOS
brew install tailscale
open -a Tailscale  # sign in via the menu bar app

# Linux
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

NanoClaw itself doesn't need any configuration change — Tailscale handles the networking transparently.

---

## Running on Linux / Cloud VM

Tested on Hetzner CX42 (8 vCPU, 16 GB RAM, ARM64). Differences from Mac:

| Feature | macOS | Linux |
|---------|-------|-------|
| Container runtime | OrbStack | Docker (`apt install docker.io`) |
| Auto-start | LaunchAgent (`launchctl`) | systemd service |
| iMessage | Available (via Shortcuts) | Not available |
| Apple Container | Available | Not available |

**systemd service (Linux):**

```bash
sudo tee /etc/systemd/system/nanoclaw.service > /dev/null <<EOF
[Unit]
Description=NanoClaw Agent
After=network.target docker.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(node -e "console.log(process.execPath)") dist/index.js
Restart=on-failure
RestartSec=5
EnvironmentFile=$(pwd)/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now nanoclaw
```

---

## Troubleshooting

**Bot doesn't respond in Slack**
- Check that Socket Mode is enabled in your Slack app settings
- Verify `SLACK_BOT_TOKEN` starts with `xoxb-` and `SLACK_APP_TOKEN` starts with `xapp-`
- Make sure the bot is invited to the channel: `/invite @hex`

**Container fails to start**
- Run `docker ps` to check if Docker/OrbStack is running
- Check `logs/nanoclaw.error.log` for the specific error
- First run pulls the container image — can take 1-2 minutes on a slow connection

**`ANTHROPIC_API_KEY` errors inside the container**
- The key is injected from `.env` at container start; restart NanoClaw after editing `.env`
- Verify the key is valid at [console.anthropic.com](https://console.anthropic.com)

**IPC tasks not running**
- Tasks are written to `data/ipc/{group}/` and processed by the host watcher
- Check `data/ipc/` exists and is writable: `ls -la data/ipc/`
- Look for `.error` files alongside task files for failure details

**Upstream sync conflicts**
```bash
git fetch upstream
git merge upstream/main
# Conflicts will only be in: src/ipc.ts, Dockerfile
# All other hex-specific files are additive
```

## Global gitignore

A global gitignore template is included at `config/gitignore_global`. Install it on each container:

```bash
git config --global core.excludesfile ~/github.com/mrap/hex-nanoclaw/config/gitignore_global
```
