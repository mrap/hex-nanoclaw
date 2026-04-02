# NanoClaw Backup Strategy

Generated: 2026-04-01  
Instance: `~/github.com/mrap/hex-nanoclaw`  
Reference inventory: `docs/backup-inventory.md`

---

## Executive Summary

Total backup footprint is ~68.3 MB, dominated by the `onecli_pgdata` Docker volume (~66.8 MB). Given this small size, **full backups on every run** are the right call — no incremental complexity needed.

**Recommended approach:** single timestamped `.tar.gz` archive, placed locally and optionally synced to iCloud Drive.

---

## Per-Component Strategy

### 1. Secrets: `.env`

| Attribute | Detail |
|-----------|--------|
| Classification | secrets |
| Size | ~4 KB |
| Priority | CRITICAL |
| Method | Encrypt with AES-256 before archiving |
| Tool | `openssl enc -aes-256-cbc -pbkdf2` (no GPG dependency) |

**Handling:**
- Encrypt immediately after reading: `openssl enc -aes-256-cbc -pbkdf2 -in .env -out .env.enc`
- Passphrase is prompted interactively; never stored on disk
- The unencrypted `.env` is **never** written to the archive
- Restore: `openssl enc -d -aes-256-cbc -pbkdf2 -in .env.enc -out .env`

**Why not GPG?** GPG is not installed on this machine. OpenSSL's symmetric AES encryption requires only a passphrase and is available everywhere.

---

### 2. SQLite Databases: `store/messages.db`

| Attribute | Detail |
|-----------|--------|
| Classification | runtime |
| Size | ~1.3 MB (db + WAL) |
| Priority | CRITICAL |
| Method | `sqlite3 .backup` API |

**Handling:**
```bash
sqlite3 store/messages.db "PRAGMA wal_checkpoint(TRUNCATE);"
sqlite3 store/messages.db ".backup /tmp/nanoclaw_backup_messages.db"
```

The `.backup` command produces a fully consistent copy even while the database is live — it handles WAL internally. The WAL checkpoint before backup ensures the copy is up-to-date. The `-shm` and `-wal` sidecar files are **not** included in the archive (they are derived).

**Do not:** use `cp` directly. A raw copy of a WAL-mode database without checkpointing risks corruption.

---

### 3. OneCLI Docker Volumes: `onecli_pgdata` and `onecli_app-data`

| Attribute | Detail |
|-----------|--------|
| Classification | secrets (`pgdata`), runtime (`app-data`) |
| Size | ~66.8 MB + ~970 B |
| Priority | CRITICAL (`pgdata`), MEDIUM (`app-data`) |
| Method | `docker run busybox tar` export |

**Handling:**
```bash
# Export pgdata (contains all registered API keys)
docker run --rm \
  -v onecli_pgdata:/data \
  -v /tmp/nanoclaw_vol_backup:/backup \
  busybox tar czf /backup/onecli_pgdata.tar.gz /data

# Export app-data
docker run --rm \
  -v onecli_app-data:/data \
  -v /tmp/nanoclaw_vol_backup:/backup \
  busybox tar czf /backup/onecli_app-data.tar.gz /data
```

**Encryption:** The `onecli_pgdata.tar.gz` contains credentials and must be encrypted:
```bash
openssl enc -aes-256-cbc -pbkdf2 \
  -in /tmp/nanoclaw_vol_backup/onecli_pgdata.tar.gz \
  -out /tmp/nanoclaw_vol_backup/onecli_pgdata.tar.gz.enc
rm /tmp/nanoclaw_vol_backup/onecli_pgdata.tar.gz
```

**Restore:**
```bash
# Decrypt
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in onecli_pgdata.tar.gz.enc \
  -out onecli_pgdata.tar.gz

# Recreate volume and import
docker volume create onecli_pgdata
docker run --rm \
  -v onecli_pgdata:/data \
  -v $(pwd):/backup \
  busybox tar xzf /backup/onecli_pgdata.tar.gz -C /
```

**Alternative — OneCLI secrets list export:** The backup script also exports a plaintext inventory of registered secret names (not values) via `onecli list` if the service is running. This gives a human-readable manifest of what needs to be re-registered if the vault is ever lost.

---

### 4. Config Files

Covers: `config/groups.json`, `config/policies/*.yaml`, `config/mount-allowlist.json`, `config/slack-app-manifest.yaml`, `~/.onecli/docker-compose.yml`

| Attribute | Detail |
|-----------|--------|
| Classification | config |
| Size | ~5 KB total |
| Priority | HIGH |
| Method | Plain directory copy into archive |

These files are not secret and can be stored unencrypted. They are small and captured as a simple `tar` tree.

---

### 5. Group Files

Covers: `groups/*/CLAUDE.md`, `groups/*/MEMORY.md`, `groups/*/USER.md`

| Attribute | Detail |
|-----------|--------|
| Classification | config + runtime |
| Size | ~55 KB |
| Priority | HIGH |
| Method | Plain directory copy into archive |

`CLAUDE.md` files are large (up to 41 KB) and heavily customised — highest priority among group files. `MEMORY.md` is accumulated agent state and cannot be recreated. Both are stored unencrypted (no secrets).

---

### 6. Host-level Config: `~/.config/nanoclaw/`

Not present on this instance. Spec referenced `mount-allowlist.json` and `sender-allowlist.json` here, but they live in `config/` inside the repo. No special handling needed.

---

### 7. Session Data: `data/sessions/`

| Attribute | Detail |
|-----------|--------|
| Classification | runtime |
| Size | ~100 KB |
| Priority | MEDIUM |
| Method | Plain directory copy into archive |

Active Claude session files. Losing them means containers restart with a fresh session on next run — significant but not catastrophic.

---

## Incremental vs Full Backup

| Factor | Full | Incremental |
|--------|------|-------------|
| Simplicity | High | Low |
| Total size | ~68.3 MB | ~1–5 MB/day (config + DB changes) |
| Docker volume handling | Straightforward | Complex (volume diffs are hard) |
| Restore complexity | Simple: extract archive | Must apply diffs in order |
| Risk of restore failure | Low | Medium (chain corruption) |

**Decision: Full backups.** At 68.3 MB total (mostly the immutable Postgres volume), a full backup completes in seconds. Incremental complexity is not warranted.

---

## Backup Location Options

| Option | Pros | Cons | Score |
|--------|------|------|:-----:|
| **Local archive** (`~/backups/nanoclaw/`) | Fast, no network, simple | Single point of failure | 3/5 |
| **iCloud Drive** (`~/Library/Mobile Documents/...`) | Free (5 GB), offsite, automatic sync, macOS-native | Requires network, Apple dependency | 4/5 |
| **Private GitHub repo** | History, free, familiar | Binary files need Git LFS, 1 GB LFS limit hits Postgres volume fast | 2/5 |
| **S3 / rclone** | Scalable, cross-cloud | Requires setup, cost, extra credentials | 3/5 |

**Recommendation: Two-layer strategy**

1. **Primary:** Local archive at `~/backups/nanoclaw/YYYY-MM-DD_HH-MM-SS.tar.gz`
2. **Secondary:** Copy to iCloud Drive at `~/Library/Mobile Documents/com~apple~CloudDocs/backups/nanoclaw/`

The iCloud copy provides offsite redundancy with zero configuration. The local copy provides fast restore without network dependency.

---

## Retention Policy

| Layer | Retention |
|-------|-----------|
| Local (`~/backups/nanoclaw/`) | Keep last 7 archives; delete older ones automatically |
| iCloud Drive | Keep last 30 archives; iCloud handles versioning at OS level |

7 local copies covers a week of daily backups. 30 iCloud copies covers a month. Given the small archive size (~70 MB), 7 local copies = ~490 MB, 30 iCloud copies = ~2.1 GB — both well within typical disk budgets.

---

## What to Back Up: Consolidated List

The backup script will capture these paths (relative to `~/github.com/mrap/hex-nanoclaw/` unless noted):

```
ENCRYPTED:
  .env                              → .env.enc
  onecli_pgdata (Docker volume)     → onecli_pgdata.tar.gz.enc

UNENCRYPTED:
  config/groups.json
  config/policies/
  config/mount-allowlist.json
  config/slack-app-manifest.yaml
  groups/*/CLAUDE.md
  groups/*/MEMORY.md
  groups/*/USER.md
  data/sessions/                    (MEDIUM — included but skippable)
  store/messages.db                 (via .backup API → consistent snapshot)
  ~/.onecli/docker-compose.yml
  onecli_app-data (Docker volume)   → onecli_app-data.tar.gz

EXCLUDED:
  dist/              (derived — npm build output)
  node_modules/      (derived — npm install)
  store/*.db-shm     (derived — SQLite WAL index)
  data/ipc/          (ephemeral)
  data/sessions/*/agent-runner-src/  (derived)
  logs/              (LOW priority — informational only)
```

---

## Archive Format

```
nanoclaw_YYYY-MM-DD_HH-MM-SS.tar.gz
└── nanoclaw_YYYY-MM-DD_HH-MM-SS/
    ├── manifest.txt               ← list of all files + checksums
    ├── .env.enc                   ← AES-256 encrypted
    ├── store/
    │   └── messages.db            ← SQLite .backup snapshot
    ├── config/
    │   ├── groups.json
    │   ├── policies/
    │   ├── mount-allowlist.json
    │   └── slack-app-manifest.yaml
    ├── groups/
    │   └── <group>/
    │       ├── CLAUDE.md
    │       ├── MEMORY.md
    │       └── USER.md
    ├── data/
    │   └── sessions/
    ├── onecli/
    │   ├── docker-compose.yml
    │   ├── onecli_pgdata.tar.gz.enc  ← AES-256 encrypted
    │   └── onecli_app-data.tar.gz
    └── onecli-secrets-list.txt    ← names only, no values
```

---

## Restore Procedure (Outline)

Full step-by-step instructions will be in a dedicated restore doc generated by t-4. High-level:

1. **Stop NanoClaw** — `docker compose down` in the instance directory
2. **Stop OneCLI** — `cd ~/.onecli && docker compose down`
3. **Decrypt secrets** — `openssl enc -d ...` for `.env.enc` and `onecli_pgdata.tar.gz.enc`
4. **Restore files** — Extract archive tree to their original locations
5. **Restore SQLite** — Copy `store/messages.db` into place (already a clean snapshot)
6. **Restore Docker volumes** — `docker volume create` then `busybox tar xzf` import
7. **Start OneCLI** — `cd ~/.onecli && docker compose up -d`
8. **Start NanoClaw** — `docker compose up -d` (or launchd service)
9. **Verify** — Check Slack connectivity, confirm group registrations

**Recovery time estimate:** 5–10 minutes for a full restore on a new machine (excluding Docker pull times).

---

## Trade-offs Summary

| Decision | Choice | Runner-up | Reason |
|----------|--------|-----------|--------|
| Full vs incremental | Full | Incremental | Small total size; Docker volume diffs are impractical |
| Encryption tool | OpenSSL AES-256 | GPG | GPG not installed; OpenSSL is always available |
| Primary location | Local archive | iCloud only | Fast restore without network dependency |
| Secondary location | iCloud Drive | S3/rclone | Zero setup; free on macOS |
| Archive format | `.tar.gz` | `.zip` | Better symlink handling; standard on Unix |
