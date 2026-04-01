import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

import { EventStore } from '../../src/policy-engine/event-store.js';
import { PolicyLoader } from '../../src/policy-engine/policy-loader.js';
import { PolicyEngine } from '../../src/policy-engine/engine.js';

export interface TestContext {
  db: Database.Database;
  dbPath: string;
  store: EventStore;
  loader: PolicyLoader;
  engine: PolicyEngine;
  cleanup: () => void;
}

export function createTestContext(policyDir: string): TestContext {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const messagesLog = path.join(tmpDir, 'messages.log');

  const db = new Database(dbPath);
  const store = new EventStore(db);

  const sendMessage = async (jid: string, text: string): Promise<void> => {
    fs.appendFileSync(messagesLog, `${jid}: ${text}\n`);
  };

  const loader = new PolicyLoader(policyDir, store);
  const engine = new PolicyEngine(store, { sendMessage });

  const cleanup = (): void => {
    try {
      db.close();
    } catch {
      // ignore
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  return { db, dbPath, store, loader, engine, cleanup };
}

export function getEvents(
  db: Database.Database,
): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM events ORDER BY id').all() as Array<
    Record<string, unknown>
  >;
}

export function getActionLogs(
  db: Database.Database,
): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM action_log ORDER BY id').all() as Array<
    Record<string, unknown>
  >;
}

export function getEvalLogs(
  db: Database.Database,
): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM policy_eval_log ORDER BY id').all() as Array<
    Record<string, unknown>
  >;
}

export function getPolicies(
  db: Database.Database,
): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM policies ORDER BY id').all() as Array<
    Record<string, unknown>
  >;
}

let passCount = 0;
let failCount = 0;

export function assert(condition: boolean, message: string): void {
  if (condition) {
    passCount++;
    console.log(`  PASS: ${message}`);
  } else {
    failCount++;
    console.error(`  FAIL: ${message}`);
    process.exitCode = 1;
  }
}

export function assertEq<T>(actual: T, expected: T, message: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passCount++;
    console.log(`  PASS: ${message}`);
  } else {
    failCount++;
    console.error(
      `  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exitCode = 1;
  }
}

export function assertGte(
  actual: number,
  expected: number,
  message: string,
): void {
  if (actual >= expected) {
    passCount++;
    console.log(`  PASS: ${message}`);
  } else {
    failCount++;
    console.error(
      `  FAIL: ${message} — expected >= ${expected}, got ${actual}`,
    );
    process.exitCode = 1;
  }
}

export function getTestCounts(): { pass: number; fail: number } {
  return { pass: passCount, fail: failCount };
}

export function resetTestCounts(): void {
  passCount = 0;
  failCount = 0;
}
