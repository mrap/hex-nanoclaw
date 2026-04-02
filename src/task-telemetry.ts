/**
 * Task telemetry signal classifier.
 *
 * Run by the task-telemetry policy on container.exit and task.completed events.
 * Reads task_run_logs from the NanoClaw messages.db and writes signals to signals.db.
 *
 * Environment variables:
 *   NC_STORE_DIR   - path to store/ dir (default: <project_root>/store)
 *   NC_EVENT_TYPE  - 'container.exit' | 'task.completed'
 *   NC_TASK_ID     - task ID (required for task.completed)
 *   NC_GROUP       - group folder name
 *   NC_DURATION_MS - task duration in ms
 *   NC_EXIT_CODE   - exit code (required for container.exit)
 *   NC_RESULT      - result text (for task.completed)
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const storeDir = process.env.NC_STORE_DIR ?? path.join(PROJECT_ROOT, 'store');
const mainDbPath = path.join(storeDir, 'messages.db');
const signalsDbPath = path.join(storeDir, 'signals.db');

const eventType = process.env.NC_EVENT_TYPE ?? '';
const taskId = process.env.NC_TASK_ID ?? '';
const groupName = process.env.NC_GROUP ?? '';
const durationMs = parseInt(process.env.NC_DURATION_MS ?? '0', 10);
const exitCode = parseInt(process.env.NC_EXIT_CODE ?? '0', 10);
const result = process.env.NC_RESULT ?? '';

export interface Signal {
  task_id: string;
  signal_type: 'friction' | 'error' | 'correction' | 'success' | 'minor_success' | 'gap';
  group_name: string;
  duration_ms: number | null;
  detail: string | null;
}

export function initSignalsDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS signals (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id     TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      group_name  TEXT NOT NULL,
      duration_ms INTEGER,
      detail      TEXT,
      recorded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_signals_type  ON signals(signal_type, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_signals_task  ON signals(task_id);
    CREATE INDEX IF NOT EXISTS idx_signals_group ON signals(group_name, recorded_at);
  `);
}

const CORRECTION_PHRASES = ['retry', 'fallback', 'failed, trying', 'let me try', 'trying again'];

export function classifyContainerExit(opts: {
  exitCode: number;
  durationMs: number;
}): 'friction' | 'error' | null {
  if (opts.exitCode === 0) return null;
  return opts.durationMs < 20_000 ? 'friction' : 'error';
}

export function classifyTaskCompleted(opts: {
  result: string;
  durationMs: number;
}): 'correction' | 'success' | 'minor_success' {
  const lower = opts.result.toLowerCase();
  if (CORRECTION_PHRASES.some(p => lower.includes(p))) return 'correction';
  if (opts.durationMs > 60_000) return 'success';
  return 'minor_success';
}

export function checkGap(mainDb: Database.Database, taskId: string): number {
  const row = mainDb.prepare(
    `SELECT COUNT(*) as cnt FROM task_run_logs
     WHERE task_id = ? AND status = 'error' AND run_at > datetime('now', '-7 days')`,
  ).get(taskId) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

// --- CLI entry point ---

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.mkdirSync(storeDir, { recursive: true });
  const sigDb = new Database(signalsDbPath);
  initSignalsDb(sigDb);

  const insert = sigDb.prepare(
    `INSERT INTO signals (task_id, signal_type, group_name, duration_ms, detail, recorded_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  );

  function record(type: Signal['signal_type'], detail: string | null) {
    insert.run(taskId || 'unknown', type, groupName, durationMs || null, detail?.slice(0, 500) ?? null);
    process.stdout.write(`[task-telemetry] ${type} signal for task=${taskId} group=${groupName}\n`);
  }

  if (eventType === 'container.exit') {
    const signalType = classifyContainerExit({ exitCode, durationMs });
    if (signalType) {
      let detail: string | null = null;
      if (fs.existsSync(mainDbPath)) {
        const mainDb = new Database(mainDbPath, { readonly: true });
        const row = mainDb.prepare(
          `SELECT trl.error FROM task_run_logs trl
           JOIN scheduled_tasks st ON st.id = trl.task_id
           WHERE st.group_folder LIKE ?
           ORDER BY trl.run_at DESC LIMIT 1`,
        ).get(`%${groupName}%`) as { error: string | null } | undefined;
        detail = row?.error ?? null;
        mainDb.close();
      }
      record(signalType, detail);
    }
  } else if (eventType === 'task.completed') {
    const signalType = classifyTaskCompleted({ result, durationMs });
    record(signalType, result);

    // Gap detection: same task failed 3+ times in rolling 7 days
    if (taskId && fs.existsSync(mainDbPath)) {
      const mainDb = new Database(mainDbPath, { readonly: true });
      const failCount = checkGap(mainDb, taskId);
      mainDb.close();
      if (failCount >= 3) {
        record('gap', `Task ${taskId} failed ${failCount} times in last 7 days`);
      }
    }
  } else {
    process.stderr.write(`[task-telemetry] unknown event type: ${eventType}\n`);
    process.exit(1);
  }

  sigDb.close();
}
