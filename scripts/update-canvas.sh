#!/bin/bash
# update-canvas.sh — refresh the hex-main Slack Canvas with live data

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# Load tokens
source "$REPO_DIR/data/env/env"
source "$REPO_DIR/data/env/canvas.env"

DB="$REPO_DIR/store/messages.db"
TODO_FILE="/workspace/extra/github/hex/todo.md"
TMPDIR_LOCAL=$(mktemp -d)
trap "rm -rf $TMPDIR_LOCAL" EXIT

# --- Gather data into temp files ---

# Active BOI tasks
sqlite3 "$DB" \
  "SELECT id || ' | ' || substr(prompt, 1, 80) FROM scheduled_tasks WHERE status='active' ORDER BY created_at DESC LIMIT 10" \
  2>/dev/null > "$TMPDIR_LOCAL/active.txt" || true

# Last 5 successful task runs in last 24h
sqlite3 "$DB" \
  "SELECT trl.run_at || ' | ' || substr(coalesce(st.prompt,'(unknown)'), 1, 60)
   FROM task_run_logs trl
   LEFT JOIN scheduled_tasks st ON st.id = trl.task_id
   WHERE trl.status='success'
     AND trl.run_at > datetime('now', '-24 hours')
   ORDER BY trl.run_at DESC LIMIT 5" \
  2>/dev/null > "$TMPDIR_LOCAL/completions.txt" || true

# Todo (first 20 lines)
head -20 "$TODO_FILE" 2>/dev/null > "$TMPDIR_LOCAL/todo.txt" || echo "(no todo file)" > "$TMPDIR_LOCAL/todo.txt"

# Build and send canvas update via node script
node - "$SLACK_BOT_TOKEN" "$HEX_CANVAS_ID" "$TMPDIR_LOCAL" << 'NODEEOF'
import { readFileSync } from 'fs';
import { resolve } from 'path';

const [,, token, canvasId, tmpDir] = process.argv;

const timestamp = new Date().toISOString().slice(0,16).replace('T',' ') + ' UTC';

function readLines(file) {
  try {
    return readFileSync(resolve(tmpDir, file), 'utf8').trim();
  } catch { return ''; }
}

const activeRaw = readLines('active.txt');
const completionsRaw = readLines('completions.txt');
const todoRaw = readLines('todo.txt');

const activeTasks = activeRaw
  ? activeRaw.split('\n').map(l => {
      const [id, ...rest] = l.split(' | ');
      return `• [${id.slice(0,20)}] ${rest.join(' | ').slice(0,80)}`;
    }).join('\n')
  : '(none)';

const completions = completionsRaw
  ? completionsRaw.split('\n').map(l => {
      const [ts, ...rest] = l.split(' | ');
      return `• [${ts.slice(0,16)}] ${rest.join(' | ').slice(0,60)}`;
    }).join('\n')
  : '(none in the last 24h)';

const todo = todoRaw || '(empty)';

const mdContent = [
  `# hex system status`,
  `*Last updated: ${timestamp}*`,
  ``,
  `## 🤖 Active BOI Tasks`,
  activeTasks,
  ``,
  `## ✅ Recently Completed (24h)`,
  completions,
  ``,
  `## 📋 Open Items`,
  todo,
].join('\n');

const payload = {
  canvas_id: canvasId,
  changes: [{
    operation: "replace",
    document_content: {
      type: "markdown",
      markdown: mdContent
    }
  }]
};

const res = await fetch('https://slack.com/api/canvases.edit', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json; charset=utf-8'
  },
  body: JSON.stringify(payload)
});

const data = await res.json();
if (data.ok) {
  console.log('Canvas updated:', canvasId);
} else {
  console.error('Canvas update failed:', JSON.stringify(data));
  process.exit(1);
}
NODEEOF
