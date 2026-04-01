import Database from 'better-sqlite3';
import type { Event, PolicyEvalResult, ActionResult } from './types.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    source TEXT NOT NULL DEFAULT 'system',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    processed_at TEXT,
    dedup_key TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events_unprocessed ON events(processed_at) WHERE processed_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_events_type_created ON events(event_type, created_at);
  CREATE INDEX IF NOT EXISTS idx_events_dedup ON events(dedup_key) WHERE dedup_key IS NOT NULL;

  CREATE TABLE IF NOT EXISTS policy_eval_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    policy_name TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    trigger_matched INTEGER NOT NULL,
    conditions_passed INTEGER,
    condition_details TEXT,
    rate_limited INTEGER DEFAULT 0,
    action_taken INTEGER DEFAULT 0,
    evaluated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_eval_log_event ON policy_eval_log(event_id);

  CREATE TABLE IF NOT EXISTS action_log (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL,
    policy_name TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_detail TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    duration_ms INTEGER,
    executed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_action_log_event ON action_log(event_id);

  CREATE TABLE IF NOT EXISTS deferred_events (
    id INTEGER PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    source TEXT NOT NULL DEFAULT 'system',
    fire_at TEXT NOT NULL,
    cancel_group TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_deferred_fire ON deferred_events(fire_at);
  CREATE INDEX IF NOT EXISTS idx_deferred_cancel ON deferred_events(cancel_group) WHERE cancel_group IS NOT NULL;

  CREATE TABLE IF NOT EXISTS policies (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    yaml_content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'user',
    source_group TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    fire_count INTEGER DEFAULT 0,
    max_fires INTEGER
  );
`;

export class EventStore {
  private stmts: Record<string, Database.Statement>;

  constructor(private db: Database.Database) {
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 30000');
    db.exec(SCHEMA);

    this.stmts = {
      emit: db.prepare(
        `INSERT INTO events (event_type, payload, source, dedup_key) VALUES (?, ?, ?, ?)`,
      ),
      emitCheckDedup: db.prepare(`SELECT id FROM events WHERE dedup_key = ?`),
      getUnprocessed: db.prepare(
        `SELECT * FROM events WHERE processed_at IS NULL ORDER BY id ASC LIMIT ?`,
      ),
      markProcessed: db.prepare(
        `UPDATE events SET processed_at = datetime('now') WHERE id = ?`,
      ),
      countEvents: db.prepare(
        `SELECT COUNT(*) as cnt FROM events WHERE event_type = ? AND created_at > datetime('now', ?)`,
      ),
      logEval: db.prepare(
        `INSERT INTO policy_eval_log (event_id, policy_name, rule_name, trigger_matched, conditions_passed, condition_details, rate_limited, action_taken)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      getEvalLogs: db.prepare(
        `SELECT * FROM policy_eval_log WHERE event_id = ? ORDER BY id`,
      ),
      logAction: db.prepare(
        `INSERT INTO action_log (event_id, policy_name, rule_name, action_type, action_detail, status, error_message, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      getActionLogs: db.prepare(
        `SELECT * FROM action_log WHERE event_id = ? ORDER BY id`,
      ),
      addDeferred: db.prepare(
        `INSERT INTO deferred_events (event_type, payload, source, fire_at, cancel_group) VALUES (?, ?, ?, ?, ?)`,
      ),
      getDueDeferred: db.prepare(
        `SELECT * FROM deferred_events WHERE fire_at <= datetime('now') ORDER BY fire_at`,
      ),
      deleteDeferred: db.prepare(`DELETE FROM deferred_events WHERE id = ?`),
      cancelDeferred: db.prepare(
        `DELETE FROM deferred_events WHERE cancel_group = ?`,
      ),
      disablePolicy: db.prepare(
        `UPDATE policies SET enabled = 0, updated_at = datetime('now') WHERE name = ?`,
      ),
      deletePolicy: db.prepare(`DELETE FROM policies WHERE name = ?`),
    };
  }

  emit(
    eventType: string,
    payload: Record<string, unknown>,
    source: string,
    dedupKey?: string,
  ): number {
    if (dedupKey) {
      const existing = this.stmts.emitCheckDedup.get(dedupKey) as
        | { id: number }
        | undefined;
      if (existing) return existing.id;
    }
    const result = this.stmts.emit.run(
      eventType,
      JSON.stringify(payload),
      source,
      dedupKey ?? null,
    );
    return result.lastInsertRowid as number;
  }

  getUnprocessed(limit: number): Event[] {
    return this.stmts.getUnprocessed.all(limit) as Event[];
  }

  markProcessed(eventId: number): void {
    this.stmts.markProcessed.run(eventId);
  }

  countEvents(eventType: string, seconds: number): number {
    const offset = `-${seconds} seconds`;
    const row = this.stmts.countEvents.get(eventType, offset) as {
      cnt: number;
    };
    return row.cnt;
  }

  logEval(result: PolicyEvalResult): void {
    this.stmts.logEval.run(
      result.event_id,
      result.policy_name,
      result.rule_name,
      result.trigger_matched ? 1 : 0,
      result.conditions_passed == null
        ? null
        : result.conditions_passed
          ? 1
          : 0,
      JSON.stringify(result.condition_details),
      result.rate_limited ? 1 : 0,
      result.action_taken ? 1 : 0,
    );
  }

  getEvalLogs(eventId: number): Array<Record<string, unknown>> {
    return this.stmts.getEvalLogs.all(eventId) as Array<
      Record<string, unknown>
    >;
  }

  logAction(result: ActionResult): void {
    this.stmts.logAction.run(
      result.event_id,
      result.policy_name,
      result.rule_name,
      result.action_type,
      result.action_detail,
      result.status,
      result.error_message,
      result.duration_ms,
    );
  }

  getActionLogs(eventId: number): Array<Record<string, unknown>> {
    return this.stmts.getActionLogs.all(eventId) as Array<
      Record<string, unknown>
    >;
  }

  addDeferred(
    eventType: string,
    payload: Record<string, unknown>,
    source: string,
    fireAt: string,
    cancelGroup?: string,
  ): void {
    const normalizedFireAt = fireAt
      .replace('T', ' ')
      .replace('Z', '')
      .replace(/\.\d{3}$/, '');
    this.stmts.addDeferred.run(
      eventType,
      JSON.stringify(payload),
      source,
      normalizedFireAt,
      cancelGroup ?? null,
    );
  }

  getDueDeferred(): Array<{
    id: number;
    event_type: string;
    payload: string;
    source: string;
    fire_at: string;
    cancel_group: string | null;
  }> {
    return this.stmts.getDueDeferred.all() as Array<{
      id: number;
      event_type: string;
      payload: string;
      source: string;
      fire_at: string;
      cancel_group: string | null;
    }>;
  }

  deleteDeferred(id: number): void {
    this.stmts.deleteDeferred.run(id);
  }

  cancelDeferred(cancelGroup: string): void {
    this.stmts.cancelDeferred.run(cancelGroup);
  }

  disablePolicy(name: string): void {
    this.stmts.disablePolicy.run(name);
  }

  deletePolicy(name: string): void {
    this.stmts.deletePolicy.run(name);
  }

  getEnabledPolicies(): Array<{
    name: string;
    yaml_content: string;
    source: string;
    source_group: string | null;
    fire_count: number;
    max_fires: number | null;
  }> {
    return this.db
      .prepare(`SELECT * FROM policies WHERE enabled = 1`)
      .all() as Array<{
      name: string;
      yaml_content: string;
      source: string;
      source_group: string | null;
      fire_count: number;
      max_fires: number | null;
    }>;
  }
}
