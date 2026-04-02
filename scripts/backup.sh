#!/usr/bin/env bash
# backup.sh — NanoClaw instance backup and restore
#
# Usage:
#   bash scripts/backup.sh [--dry-run]           backup (dry run shows plan)
#   bash scripts/backup.sh --restore <archive>   restore from archive
#   bash scripts/backup.sh --verify <archive>    check archive completeness
#
# Strategy: full backup every run, single timestamped .tar.gz
# Encrypted: .env, onecli_pgdata Docker volume (AES-256 via openssl)
# SQLite:    sqlite3 .backup API (WAL-safe)
# Location:  ~/backups/nanoclaw/  +  iCloud Drive (if available)
# Retention: keep last 7 local, last 30 iCloud

set -uo pipefail

# ─── Paths ────────────────────────────────────────────────────────────────────
INSTANCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${HOME}/backups/nanoclaw"
ICLOUD_BACKUP_DIR="${HOME}/Library/Mobile Documents/com~apple~CloudDocs/backups/nanoclaw"
TIMESTAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
ARCHIVE_NAME="nanoclaw_${TIMESTAMP}"
ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}.tar.gz"

LOCAL_KEEP=7
ICLOUD_KEEP=30

# ─── Helpers ──────────────────────────────────────────────────────────────────
log()  { echo "[backup] $*"; }
warn() { echo "[backup] WARN: $*" >&2; }
die()  { echo "[backup] ERROR: $*" >&2; exit 1; }

DRY_RUN=false
MODE="backup"
RESTORE_ARCHIVE=""
VERIFY_ARCHIVE=""

# ─── Arg parsing ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --restore)
      MODE="restore"
      RESTORE_ARCHIVE="${2:-}"
      [[ -z "$RESTORE_ARCHIVE" ]] && die "--restore requires an archive path"
      shift 2
      ;;
    --verify)
      MODE="verify"
      VERIFY_ARCHIVE="${2:-}"
      [[ -z "$VERIFY_ARCHIVE" ]] && die "--verify requires an archive path"
      shift 2
      ;;
    *)
      die "Unknown argument: $1. Usage: backup.sh [--dry-run] | --restore <archive> | --verify <archive>"
      ;;
  esac
done

# ─── DRY RUN ──────────────────────────────────────────────────────────────────
if [[ "$DRY_RUN" == "true" ]]; then
  log "=== DRY RUN — nothing will be written ==="
  log ""
  log "Instance dir : ${INSTANCE_DIR}"
  log "Archive path : ${ARCHIVE_PATH}"
  log ""
  log "Would back up (ENCRYPTED with AES-256 openssl):"
  if [[ -f "${INSTANCE_DIR}/.env" ]]; then
    log "  .env  →  ${ARCHIVE_NAME}/.env.enc"
  else
    log "  .env  (NOT FOUND — would skip)"
  fi
  if docker volume inspect onecli_pgdata >/dev/null 2>&1; then
    log "  Docker volume onecli_pgdata  →  ${ARCHIVE_NAME}/onecli/onecli_pgdata.tar.gz.enc"
  else
    log "  Docker volume onecli_pgdata  (NOT FOUND — would skip)"
  fi
  log ""
  log "Would back up (unencrypted):"

  # Config files
  for f in groups.json mount-allowlist.json slack-app-manifest.yaml event-catalog.yaml; do
    if [[ -f "${INSTANCE_DIR}/config/${f}" ]]; then
      log "  config/${f}"
    else
      log "  config/${f}  (not found — would skip)"
    fi
  done
  if [[ -d "${INSTANCE_DIR}/config/policies" ]]; then
    log "  config/policies/"
  else
    log "  config/policies/  (not found — would skip)"
  fi

  # Groups
  if [[ -d "${INSTANCE_DIR}/groups" ]]; then
    for group_dir in "${INSTANCE_DIR}/groups"/*/; do
      [[ -d "$group_dir" ]] || continue
      group="$(basename "$group_dir")"
      for gf in CLAUDE.md MEMORY.md USER.md; do
        if [[ -f "${group_dir}${gf}" ]]; then
          log "  groups/${group}/${gf}"
        else
          log "  groups/${group}/${gf}  (not found — would skip)"
        fi
      done
    done
  fi

  # SQLite
  if [[ -f "${INSTANCE_DIR}/store/messages.db" ]]; then
    log "  store/messages.db  (via sqlite3 .backup — WAL-safe)"
  else
    log "  store/messages.db  (not found — would skip)"
  fi

  # Sessions
  if [[ -d "${INSTANCE_DIR}/data/sessions" ]]; then
    log "  data/sessions/"
  else
    log "  data/sessions/  (not found — would skip)"
  fi

  # OneCLI config
  if [[ -f "${HOME}/.onecli/docker-compose.yml" ]]; then
    log "  ~/.onecli/docker-compose.yml"
  else
    log "  ~/.onecli/docker-compose.yml  (not found — would skip)"
  fi

  # onecli_app-data volume
  if docker volume inspect onecli_app-data >/dev/null 2>&1; then
    log "  Docker volume onecli_app-data  →  ${ARCHIVE_NAME}/onecli/onecli_app-data.tar.gz"
  else
    log "  Docker volume onecli_app-data  (not found — would skip)"
  fi

  log ""
  log "Would write:"
  log "  ${ARCHIVE_NAME}/manifest.txt"
  log "  ${ARCHIVE_NAME}/onecli-secrets-list.txt  (secret names only, no values)"
  log ""
  log "Backup destination : ${ARCHIVE_PATH}"
  if [[ -d "${HOME}/Library/Mobile Documents/com~apple~CloudDocs" ]]; then
    log "iCloud destination : ${ICLOUD_BACKUP_DIR}/${ARCHIVE_NAME}.tar.gz"
  else
    log "iCloud destination : (iCloud Drive not available — would skip)"
  fi
  log "Retention (local)  : keep last ${LOCAL_KEEP} archives"
  log "Retention (iCloud) : keep last ${ICLOUD_KEEP} archives"
  exit 0
fi

# ─── VERIFY MODE ──────────────────────────────────────────────────────────────
if [[ "$MODE" == "verify" ]]; then
  [[ ! -f "$VERIFY_ARCHIVE" ]] && die "Archive not found: $VERIFY_ARCHIVE"

  log "=== Verifying archive: $VERIFY_ARCHIVE ==="
  log ""

  VERIFY_TMP="$(mktemp -d)"
  trap 'rm -rf "$VERIFY_TMP"' EXIT

  log "Extracting archive ..."
  tar xzf "$VERIFY_ARCHIVE" -C "$VERIFY_TMP"

  ARCHIVE_ROOT_DIR="$(ls -1 "$VERIFY_TMP" | head -1)"
  VERIFY_ROOT="${VERIFY_TMP}/${ARCHIVE_ROOT_DIR}"

  ISSUES=0

  check_file() {
    local rel="$1"
    local required="${2:-false}"
    if [[ -f "${VERIFY_ROOT}/${rel}" ]]; then
      log "  ✓  ${rel}"
    else
      if [[ "$required" == "true" ]]; then
        log "  ✗  ${rel}  (MISSING — required)"
        ISSUES=$((ISSUES + 1))
      else
        log "  ~  ${rel}  (absent — optional)"
      fi
    fi
  }

  log "--- Required files ---"
  check_file "manifest.txt" true
  check_file ".env.enc" true

  log ""
  log "--- Store ---"
  if [[ -f "${VERIFY_ROOT}/store/messages.db" ]]; then
    log "  ✓  store/messages.db"
    log "     Running sqlite3 integrity_check ..."
    INTEGRITY="$(sqlite3 "${VERIFY_ROOT}/store/messages.db" "PRAGMA integrity_check;" 2>&1)"
    if [[ "$INTEGRITY" == "ok" ]]; then
      log "     ✓ integrity_check: ok"
    else
      log "     ✗ integrity_check FAILED: ${INTEGRITY}"
      ISSUES=$((ISSUES + 1))
    fi
  else
    log "  ✗  store/messages.db  (MISSING — required)"
    ISSUES=$((ISSUES + 1))
  fi

  log ""
  log "--- Config ---"
  for f in groups.json mount-allowlist.json slack-app-manifest.yaml; do
    check_file "config/${f}" true
  done
  if [[ -d "${VERIFY_ROOT}/config/policies" ]]; then
    log "  ✓  config/policies/"
  else
    log "  ~  config/policies/  (absent — optional)"
  fi

  log ""
  log "--- Groups ---"
  if [[ -d "${VERIFY_ROOT}/groups" ]]; then
    for group_dir in "${VERIFY_ROOT}/groups"/*/; do
      [[ -d "$group_dir" ]] || continue
      group="$(basename "$group_dir")"
      check_file "groups/${group}/CLAUDE.md" true
      check_file "groups/${group}/MEMORY.md" false
      check_file "groups/${group}/USER.md" false
    done
  else
    log "  ~  groups/  (absent)"
  fi

  log ""
  log "--- OneCLI ---"
  check_file "onecli/docker-compose.yml" false
  check_file "onecli/onecli_pgdata.tar.gz.enc" true
  check_file "onecli/onecli_app-data.tar.gz" false
  check_file "onecli-secrets-list.txt" false

  log ""
  log "--- All files in archive ---"
  tar tzf "$VERIFY_ARCHIVE" | sed 's/^/  /'

  log ""
  if [[ $ISSUES -eq 0 ]]; then
    log "RESULT: Archive is complete and valid."
  else
    log "RESULT: Archive has ${ISSUES} issue(s). See ✗ entries above."
    exit 1
  fi
  exit 0
fi

# ─── RESTORE MODE ─────────────────────────────────────────────────────────────
if [[ "$MODE" == "restore" ]]; then
  [[ ! -f "$RESTORE_ARCHIVE" ]] && die "Archive not found: $RESTORE_ARCHIVE"

  log "=== Restoring from: $RESTORE_ARCHIVE ==="
  log ""

  RESTORE_TMP="$(mktemp -d)"
  trap 'rm -rf "$RESTORE_TMP"' EXIT

  log "Extracting archive ..."
  tar xzf "$RESTORE_ARCHIVE" -C "$RESTORE_TMP"

  ARCHIVE_ROOT_DIR="$(ls -1 "$RESTORE_TMP" | head -1)"
  RESTORE_ROOT="${RESTORE_TMP}/${ARCHIVE_ROOT_DIR}"
  log "Archive root: ${ARCHIVE_ROOT_DIR}"
  log ""

  # ── .env ──
  if [[ -f "${RESTORE_ROOT}/.env.enc" ]]; then
    log "Decrypting .env ..."
    openssl enc -d -aes-256-cbc -pbkdf2 \
      -in "${RESTORE_ROOT}/.env.enc" \
      -out "${INSTANCE_DIR}/.env"
    log "  → ${INSTANCE_DIR}/.env"
  else
    warn ".env.enc not found in archive — skipping"
  fi

  # ── SQLite ──
  if [[ -f "${RESTORE_ROOT}/store/messages.db" ]]; then
    log "Restoring messages.db ..."
    mkdir -p "${INSTANCE_DIR}/store"
    cp "${RESTORE_ROOT}/store/messages.db" "${INSTANCE_DIR}/store/messages.db"
    log "  → ${INSTANCE_DIR}/store/messages.db"
  else
    warn "store/messages.db not found in archive — skipping"
  fi

  # ── Config ──
  if [[ -d "${RESTORE_ROOT}/config" ]]; then
    log "Restoring config/ ..."
    mkdir -p "${INSTANCE_DIR}/config"
    cp -r "${RESTORE_ROOT}/config/." "${INSTANCE_DIR}/config/"
    log "  → ${INSTANCE_DIR}/config/"
  fi

  # ── Groups ──
  if [[ -d "${RESTORE_ROOT}/groups" ]]; then
    log "Restoring groups/ ..."
    mkdir -p "${INSTANCE_DIR}/groups"
    cp -r "${RESTORE_ROOT}/groups/." "${INSTANCE_DIR}/groups/"
    log "  → ${INSTANCE_DIR}/groups/"
  fi

  # ── Sessions ──
  if [[ -d "${RESTORE_ROOT}/data/sessions" ]]; then
    log "Restoring data/sessions/ ..."
    mkdir -p "${INSTANCE_DIR}/data/sessions"
    cp -r "${RESTORE_ROOT}/data/sessions/." "${INSTANCE_DIR}/data/sessions/"
    log "  → ${INSTANCE_DIR}/data/sessions/"
  fi

  # ── OneCLI docker-compose.yml ──
  if [[ -f "${RESTORE_ROOT}/onecli/docker-compose.yml" ]]; then
    log "Restoring ~/.onecli/docker-compose.yml ..."
    mkdir -p "${HOME}/.onecli"
    cp "${RESTORE_ROOT}/onecli/docker-compose.yml" "${HOME}/.onecli/docker-compose.yml"
    log "  → ${HOME}/.onecli/docker-compose.yml"
  fi

  # ── onecli_pgdata volume ──
  if [[ -f "${RESTORE_ROOT}/onecli/onecli_pgdata.tar.gz.enc" ]]; then
    log "Decrypting and restoring onecli_pgdata Docker volume ..."
    openssl enc -d -aes-256-cbc -pbkdf2 \
      -in "${RESTORE_ROOT}/onecli/onecli_pgdata.tar.gz.enc" \
      -out "${RESTORE_TMP}/onecli_pgdata.tar.gz"
    docker volume create onecli_pgdata 2>/dev/null || true
    docker run --rm \
      -v onecli_pgdata:/data \
      -v "${RESTORE_TMP}:/backup" \
      busybox tar xzf /backup/onecli_pgdata.tar.gz -C /
    log "  → Docker volume: onecli_pgdata"
    rm -f "${RESTORE_TMP}/onecli_pgdata.tar.gz"
  else
    warn "onecli_pgdata.tar.gz.enc not found in archive — skipping volume restore"
  fi

  # ── onecli_app-data volume ──
  if [[ -f "${RESTORE_ROOT}/onecli/onecli_app-data.tar.gz" ]]; then
    log "Restoring onecli_app-data Docker volume ..."
    docker volume create onecli_app-data 2>/dev/null || true
    docker run --rm \
      -v onecli_app-data:/data \
      -v "${RESTORE_ROOT}/onecli:/backup" \
      busybox tar xzf /backup/onecli_app-data.tar.gz -C /
    log "  → Docker volume: onecli_app-data"
  fi

  log ""
  log "Restore complete."
  log ""
  log "Next steps:"
  log "  1. cd ~/.onecli && docker compose up -d"
  log "  2. cd ${INSTANCE_DIR} && docker compose up -d"
  log "  3. Verify Slack connectivity and group registrations"
  exit 0
fi

# ─── BACKUP MODE ──────────────────────────────────────────────────────────────

STAGING="$(mktemp -d)"
STAGING_ARCHIVE="${STAGING}/${ARCHIVE_NAME}"
mkdir -p "$STAGING_ARCHIVE"
trap 'rm -rf "$STAGING"' EXIT

MANIFEST_ENTRIES="${STAGING}/manifest_entries.txt"
ERRORS=0

add_manifest() {
  local path="$1"
  local note="${2:-}"
  if [[ -n "$note" ]]; then
    echo "${path}  (${note})" >> "$MANIFEST_ENTRIES"
  else
    echo "${path}" >> "$MANIFEST_ENTRIES"
  fi
}

log "Starting NanoClaw backup — ${TIMESTAMP}"
log "Instance: ${INSTANCE_DIR}"
log ""

# ── Secrets: .env ──
log "=== Secrets (encrypted) ==="

if [[ -f "${INSTANCE_DIR}/.env" ]]; then
  log "  Encrypting .env ..."
  openssl enc -aes-256-cbc -pbkdf2 \
    -in "${INSTANCE_DIR}/.env" \
    -out "${STAGING_ARCHIVE}/.env.enc"
  add_manifest ".env.enc" "AES-256 encrypted"
  log "  ✓ .env.enc"
else
  warn ".env not found — skipping"
fi

# ── SQLite databases ──
log ""
log "=== SQLite databases ==="

if [[ -f "${INSTANCE_DIR}/store/messages.db" ]]; then
  log "  Checkpointing WAL ..."
  sqlite3 "${INSTANCE_DIR}/store/messages.db" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null \
    || warn "WAL checkpoint failed (database may be locked — backup may be slightly stale)"
  mkdir -p "${STAGING_ARCHIVE}/store"
  log "  Running sqlite3 .backup ..."
  sqlite3 "${INSTANCE_DIR}/store/messages.db" ".backup ${STAGING_ARCHIVE}/store/messages.db"
  add_manifest "store/messages.db" "sqlite3 .backup snapshot"
  log "  ✓ store/messages.db"
else
  warn "store/messages.db not found — skipping"
fi

# ── Config files ──
log ""
log "=== Config files ==="

if [[ -d "${INSTANCE_DIR}/config" ]]; then
  mkdir -p "${STAGING_ARCHIVE}/config"
  for f in groups.json mount-allowlist.json slack-app-manifest.yaml event-catalog.yaml; do
    if [[ -f "${INSTANCE_DIR}/config/${f}" ]]; then
      cp "${INSTANCE_DIR}/config/${f}" "${STAGING_ARCHIVE}/config/${f}"
      add_manifest "config/${f}"
      log "  ✓ config/${f}"
    fi
  done
  if [[ -d "${INSTANCE_DIR}/config/policies" ]]; then
    cp -r "${INSTANCE_DIR}/config/policies" "${STAGING_ARCHIVE}/config/policies"
    add_manifest "config/policies/"
    log "  ✓ config/policies/"
  fi
fi

# ── Group files ──
log ""
log "=== Group files ==="

if [[ -d "${INSTANCE_DIR}/groups" ]]; then
  for group_dir in "${INSTANCE_DIR}/groups"/*/; do
    [[ -d "$group_dir" ]] || continue
    group="$(basename "$group_dir")"
    mkdir -p "${STAGING_ARCHIVE}/groups/${group}"
    for gf in CLAUDE.md MEMORY.md USER.md; do
      if [[ -f "${group_dir}${gf}" ]]; then
        cp "${group_dir}${gf}" "${STAGING_ARCHIVE}/groups/${group}/${gf}"
        add_manifest "groups/${group}/${gf}"
        log "  ✓ groups/${group}/${gf}"
      fi
    done
  done
fi

# ── Session data ──
log ""
log "=== Session data ==="

if [[ -d "${INSTANCE_DIR}/data/sessions" ]]; then
  mkdir -p "${STAGING_ARCHIVE}/data"
  cp -r "${INSTANCE_DIR}/data/sessions" "${STAGING_ARCHIVE}/data/sessions"
  add_manifest "data/sessions/" "active session files"
  log "  ✓ data/sessions/"
else
  log "  (no sessions directory)"
fi

# ── OneCLI config ──
log ""
log "=== OneCLI config ==="

mkdir -p "${STAGING_ARCHIVE}/onecli"

if [[ -f "${HOME}/.onecli/docker-compose.yml" ]]; then
  cp "${HOME}/.onecli/docker-compose.yml" "${STAGING_ARCHIVE}/onecli/docker-compose.yml"
  add_manifest "onecli/docker-compose.yml"
  log "  ✓ ~/.onecli/docker-compose.yml"
else
  warn "~/.onecli/docker-compose.yml not found — skipping"
fi

# ── Docker volumes ──
log ""
log "=== Docker volumes ==="

VOL_TMP="$(mktemp -d)"

# onecli_pgdata (encrypted)
if docker volume inspect onecli_pgdata >/dev/null 2>&1; then
  log "  Exporting onecli_pgdata ..."
  docker run --rm \
    -v onecli_pgdata:/data \
    -v "${VOL_TMP}:/backup" \
    busybox tar czf /backup/onecli_pgdata.tar.gz /data 2>/dev/null
  if [[ -f "${VOL_TMP}/onecli_pgdata.tar.gz" ]]; then
    log "  Encrypting onecli_pgdata ..."
    openssl enc -aes-256-cbc -pbkdf2 \
      -in "${VOL_TMP}/onecli_pgdata.tar.gz" \
      -out "${STAGING_ARCHIVE}/onecli/onecli_pgdata.tar.gz.enc"
    rm -f "${VOL_TMP}/onecli_pgdata.tar.gz"
    add_manifest "onecli/onecli_pgdata.tar.gz.enc" "AES-256 encrypted Docker volume"
    log "  ✓ onecli_pgdata.tar.gz.enc"
  else
    warn "Failed to export onecli_pgdata volume"
    ERRORS=$((ERRORS + 1))
  fi
else
  warn "Docker volume onecli_pgdata not found — skipping"
fi

# onecli_app-data (unencrypted)
if docker volume inspect onecli_app-data >/dev/null 2>&1; then
  log "  Exporting onecli_app-data ..."
  docker run --rm \
    -v onecli_app-data:/data \
    -v "${VOL_TMP}:/backup" \
    busybox tar czf /backup/onecli_app-data.tar.gz /data 2>/dev/null
  if [[ -f "${VOL_TMP}/onecli_app-data.tar.gz" ]]; then
    cp "${VOL_TMP}/onecli_app-data.tar.gz" "${STAGING_ARCHIVE}/onecli/onecli_app-data.tar.gz"
    rm -f "${VOL_TMP}/onecli_app-data.tar.gz"
    add_manifest "onecli/onecli_app-data.tar.gz" "Docker volume"
    log "  ✓ onecli_app-data.tar.gz"
  else
    warn "Failed to export onecli_app-data volume"
  fi
else
  warn "Docker volume onecli_app-data not found — skipping"
fi

rm -rf "${VOL_TMP}"

# ── OneCLI secrets inventory ──
log ""
log "=== OneCLI secrets inventory ==="

SECRETS_LIST="${STAGING_ARCHIVE}/onecli-secrets-list.txt"
{
  echo "# OneCLI registered secrets — names only, no values"
  echo "# Generated: $(date)"
  echo ""
} > "$SECRETS_LIST"

if command -v onecli >/dev/null 2>&1; then
  onecli list 2>/dev/null >> "$SECRETS_LIST" \
    && log "  ✓ onecli secrets list exported" \
    || warn "onecli list failed — empty list written"
else
  echo "(onecli not in PATH — vault not accessible from this shell)" >> "$SECRETS_LIST"
  log "  onecli not in PATH — skipping secrets list"
fi
add_manifest "onecli-secrets-list.txt" "secret names only, no values"

# ── Manifest ──
log ""
log "=== Manifest ==="

MANIFEST_FILE="${STAGING_ARCHIVE}/manifest.txt"
{
  echo "# NanoClaw Backup Manifest"
  echo "# Archive  : ${ARCHIVE_NAME}"
  echo "# Created  : $(date)"
  echo "# Instance : ${INSTANCE_DIR}"
  echo ""
  echo "## Files"
  [[ -f "$MANIFEST_ENTRIES" ]] && cat "$MANIFEST_ENTRIES"
} > "$MANIFEST_FILE"
log "  ✓ manifest.txt"

# ── Create final archive ──
log ""
log "=== Creating archive ==="

mkdir -p "$BACKUP_DIR"
tar czf "${ARCHIVE_PATH}.tmp" -C "$STAGING" "$ARCHIVE_NAME"
mv "${ARCHIVE_PATH}.tmp" "$ARCHIVE_PATH"

ARCHIVE_SIZE="$(du -sh "$ARCHIVE_PATH" | cut -f1)"
log "  ✓ ${ARCHIVE_PATH}  (${ARCHIVE_SIZE})"

# ── iCloud copy ──
if [[ -d "${HOME}/Library/Mobile Documents/com~apple~CloudDocs" ]]; then
  mkdir -p "$ICLOUD_BACKUP_DIR"
  cp "$ARCHIVE_PATH" "${ICLOUD_BACKUP_DIR}/${ARCHIVE_NAME}.tar.gz"
  log "  ✓ iCloud copy written"

  ls -t "${ICLOUD_BACKUP_DIR}"/*.tar.gz 2>/dev/null | tail -n +$((ICLOUD_KEEP + 1)) | while IFS= read -r old; do
    rm -f "$old"
    log "  Pruned iCloud: $(basename "$old")"
  done
else
  log "  (iCloud Drive not available — skipping secondary backup)"
fi

# ── Local retention ──
ls -t "${BACKUP_DIR}"/*.tar.gz 2>/dev/null | tail -n +$((LOCAL_KEEP + 1)) | while IFS= read -r old; do
  rm -f "$old"
  log "  Pruned local: $(basename "$old")"
done

log ""
if [[ $ERRORS -eq 0 ]]; then
  log "Backup complete."
else
  log "Backup complete with ${ERRORS} error(s) — review warnings above."
fi
log ""
log "Archive : ${ARCHIVE_PATH}  (${ARCHIVE_SIZE})"
log "Restore : bash scripts/backup.sh --restore ${ARCHIVE_PATH}"
log "Verify  : bash scripts/backup.sh --verify ${ARCHIVE_PATH}"
