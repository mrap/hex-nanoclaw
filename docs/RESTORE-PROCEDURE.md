# NanoClaw Instance Restore Procedure

This document covers how to restore a NanoClaw instance from a backup archive created by `scripts/backup.sh`.

---

## Prerequisites

Before restoring, ensure the following are available on the target machine:

| Requirement | Notes |
|-------------|-------|
| macOS (Apple Silicon or Intel) | Linux may work but is untested |
| [OrbStack](https://orbstack.dev/) | Docker runtime for containers |
| `sqlite3` CLI | Usually pre-installed on macOS |
| `openssl` CLI | Required to decrypt `.env` and OneCLI vault |
| `docker` CLI | Provided by OrbStack |
| A backup archive | `.tar.gz` file from `scripts/backup.sh` |
| The encryption passphrase | The password used at backup time |

---

## Step 0 — Verify the archive first

Always verify the archive before starting a restore:

```bash
bash scripts/backup.sh --verify /path/to/nanoclaw_YYYY-MM-DD_HH-MM-SS.tar.gz
```

Look for `RESULT: Archive is complete and valid.` at the end. Fix any `✗ MISSING — required` entries before proceeding. If you do not have the script yet, skip to Step 1 and come back.

---

## Step 1 — Clone the NanoClaw repository

The backup contains only instance-specific state. The codebase comes from GitHub.

```bash
mkdir -p ~/github.com/mrap
cd ~/github.com/mrap
git clone https://github.com/mrap/hex-nanoclaw
cd hex-nanoclaw
```

---

## Step 2 — Install host dependencies

Follow the setup guide in the repo README or `docs/README.md`. At minimum:

```bash
# Install Node dependencies (if any)
npm install

# Ensure OrbStack is running
open -a OrbStack
```

---

## Step 3 — Run the restore script

```bash
bash scripts/backup.sh --restore /path/to/nanoclaw_YYYY-MM-DD_HH-MM-SS.tar.gz
```

The script will prompt for the encryption passphrase for `.env` and the OneCLI Postgres volume. Enter the same passphrase used when the backup was created.

### What the restore script does

| Step | What happens |
|------|-------------|
| Extracts archive | Unpacks to a temp directory |
| Restores `.env` | Decrypts `.env.enc` → `~/github.com/mrap/hex-nanoclaw/.env` |
| Restores `store/messages.db` | Copies the SQLite snapshot |
| Restores `config/` | Copies `groups.json`, `mount-allowlist.json`, `slack-app-manifest.yaml`, `event-catalog.yaml`, and `policies/` |
| Restores `groups/` | Copies per-group `CLAUDE.md`, `MEMORY.md`, `USER.md` |
| Restores `data/sessions/` | Copies active session files (if present) |
| Restores `~/.onecli/docker-compose.yml` | OneCLI compose config |
| Restores `onecli_pgdata` Docker volume | Decrypts and imports the Postgres vault |
| Restores `onecli_app-data` Docker volume | OneCLI app data (if present) |

---

## Step 4 — Restore host security config (manual)

The host-level security files at `~/.config/nanoclaw/` are **not** included in the archive because they are host-specific. Re-create them on the new machine:

```bash
mkdir -p ~/.config/nanoclaw

# Edit to match your desired mount paths:
cat > ~/.config/nanoclaw/mount-allowlist.json << 'EOF'
{
  "allowlist": [
    "/Users/YOUR_USERNAME/mrap-hex"
  ]
}
EOF

# Edit to match your Slack user IDs:
cat > ~/.config/nanoclaw/sender-allowlist.json << 'EOF'
{
  "allowlist": [
    "UYOURSLACKID"
  ]
}
EOF
```

---

## Step 5 — Start OneCLI

```bash
cd ~/.onecli
docker compose up -d
```

Verify OneCLI is running:

```bash
docker compose ps
```

### Re-register secrets in the vault

The backup captures secret **names** only (in `onecli-secrets-list.txt`), not values. If the `onecli_pgdata` volume was restored successfully, secrets are already in the vault — skip this step.

If the vault volume was **not** restored (e.g., volume export failed), re-register each secret manually:

```bash
# View the list of secrets that need to be re-registered:
cat /path/to/archive/extracted/onecli-secrets-list.txt

# Re-register each one:
onecli set ANTHROPIC_API_KEY <value>
onecli set SLACK_BOT_TOKEN <value>
# ... repeat for all secrets in the list
```

---

## Step 6 — Start NanoClaw

```bash
cd ~/github.com/mrap/hex-nanoclaw
docker compose up -d
```

---

## Step 7 — Verify the restore

Check that containers are running:

```bash
docker compose ps
```

Check logs for errors:

```bash
docker compose logs --tail=50
```

Verify Slack connectivity by sending a test message to one of the registered Slack channels. Check group registration:

```bash
# From inside the container or via CLI:
# Groups should appear as registered in groups.json
cat config/groups.json
```

Verify the conversation history is present:

```bash
sqlite3 store/messages.db "SELECT COUNT(*) FROM messages;"
```

---

## Troubleshooting

### Decryption fails

```
bad decrypt
```

The passphrase is wrong. The encryption uses `openssl enc -aes-256-cbc -pbkdf2`. Try the passphrase again — there is no recovery path if the passphrase is lost.

### `store/messages.db` is corrupt

Run integrity check manually:

```bash
sqlite3 store/messages.db "PRAGMA integrity_check;"
```

If it fails, the backup itself may be corrupt. Try an older archive.

### Docker volume restore fails

If the busybox volume restore step fails, extract manually:

```bash
# Decrypt the volume:
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in onecli_pgdata.tar.gz.enc \
  -out onecli_pgdata.tar.gz

# Create volume and import:
docker volume create onecli_pgdata
docker run --rm \
  -v onecli_pgdata:/data \
  -v "$(pwd):/backup" \
  busybox tar xzf /backup/onecli_pgdata.tar.gz -C /
```

### Groups not loading

Check `config/groups.json` was restored and has the correct group definitions. Groups directory at `groups/<name>/CLAUDE.md` must exist for each registered group.

---

## Quick reference

```bash
# Verify archive
bash scripts/backup.sh --verify /path/to/archive.tar.gz

# Restore
bash scripts/backup.sh --restore /path/to/archive.tar.gz

# Create a new backup after restore (to start fresh retention chain)
bash scripts/backup.sh
```
