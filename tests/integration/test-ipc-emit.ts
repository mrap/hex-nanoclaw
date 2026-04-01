import fs from 'fs';
import os from 'os';
import path from 'path';

import Database from 'better-sqlite3';

import { EventStore } from '../../src/policy-engine/event-store.js';
import { assert, assertEq } from './helpers.js';

// ─── Test 1: File-based IPC simulation ──────────────────────────────────────
// Simulates what the IPC watcher does: read the file, parse it,
// INSERT into the events table, delete the IPC file.
async function testFileBasedIpcSimulation(): Promise<void> {
  console.log('\nTest 1: File-based IPC simulation');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-ipc-test-'));
  const dbPath = path.join(tmpDir, 'messages.db');
  const tasksDir = path.join(tmpDir, 'ipc', 'tasks');
  fs.mkdirSync(tasksDir, { recursive: true });

  try {
    // Create EventStore so the schema (events table) exists
    const db = new Database(dbPath);
    const _store = new EventStore(db);

    // Write an IPC JSON file like a container would
    const ipcPayload = {
      type: 'emit_event',
      event_type: 'container.test.event',
      payload: { marker: 'ipc-sim-test', value: 42 },
      source: 'container:main',
    };
    const ipcFile = path.join(tasksDir, `emit-${Date.now()}.json`);
    fs.writeFileSync(ipcFile, JSON.stringify(ipcPayload));

    // Simulate what the IPC watcher does: read, parse, INSERT, delete
    const rawData = JSON.parse(fs.readFileSync(ipcFile, 'utf-8'));
    assert(rawData.type === 'emit_event', 'IPC file has type emit_event');

    const eventType = rawData.event_type as string;
    const payload = rawData.payload || '{}';
    const source = rawData.source || 'container:unknown';

    const insertDb = new Database(dbPath);
    insertDb.pragma('journal_mode = WAL');
    insertDb.pragma('busy_timeout = 5000');
    insertDb
      .prepare(
        'INSERT INTO events (event_type, payload, source) VALUES (?, ?, ?)',
      )
      .run(
        eventType,
        typeof payload === 'string' ? payload : JSON.stringify(payload),
        source,
      );
    insertDb.close();

    // Clean up IPC file
    fs.unlinkSync(ipcFile);

    // Verify the event is in the DB with correct fields
    const events = db
      .prepare('SELECT * FROM events ORDER BY id')
      .all() as Array<Record<string, unknown>>;

    assertEq(events.length, 1, 'one event in the DB after IPC emit');
    assertEq(
      events[0].event_type as string,
      'container.test.event',
      'event_type matches',
    );
    assertEq(
      events[0].payload as string,
      JSON.stringify({ marker: 'ipc-sim-test', value: 42 }),
      'payload stored as JSON string',
    );
    assertEq(
      events[0].source as string,
      'container:main',
      'source stored correctly',
    );
    assert(!fs.existsSync(ipcFile), 'IPC file deleted after processing');

    db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ─── Test 2: Non-main group can emit ────────────────────────────────────────
// Same as test 1 but with source container:satellite-1.
// emit_event is unprivileged — any group can emit.
async function testNonMainGroupCanEmit(): Promise<void> {
  console.log('\nTest 2: Non-main group can emit');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-ipc-test-'));
  const dbPath = path.join(tmpDir, 'messages.db');

  try {
    // Create schema
    const db = new Database(dbPath);
    const _store = new EventStore(db);

    const sourceGroup = 'satellite-1';
    const ipcPayload = {
      type: 'emit_event',
      event_type: 'satellite.heartbeat',
      payload: { group: sourceGroup, ts: 1234567890 },
      source: `container:${sourceGroup}`,
    };

    // Simulate IPC handler logic
    const eventType = ipcPayload.event_type;
    const payload = ipcPayload.payload;
    const source = ipcPayload.source;

    const insertDb = new Database(dbPath);
    insertDb.pragma('journal_mode = WAL');
    insertDb.pragma('busy_timeout = 5000');
    insertDb
      .prepare(
        'INSERT INTO events (event_type, payload, source) VALUES (?, ?, ?)',
      )
      .run(
        eventType,
        typeof payload === 'string' ? payload : JSON.stringify(payload),
        source,
      );
    insertDb.close();

    const events = db
      .prepare('SELECT * FROM events ORDER BY id')
      .all() as Array<Record<string, unknown>>;

    assertEq(events.length, 1, 'satellite event inserted into DB');
    assertEq(
      events[0].event_type as string,
      'satellite.heartbeat',
      'event_type is satellite.heartbeat',
    );

    // Verify the source identifies the satellite group
    const storedSource = events[0].source as string;
    assert(
      storedSource.includes('satellite-1'),
      'source identifies the satellite group',
    );
    assertEq(
      storedSource,
      'container:satellite-1',
      'source is container:satellite-1',
    );

    db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ─── Test 3: IPC JSON format validation ──────────────────────────────────────
// Verify the JSON structure a container would write has the correct fields.
async function testIpcJsonFormatValidation(): Promise<void> {
  console.log('\nTest 3: IPC JSON format validation');

  // Build a representative IPC JSON as a container would produce it
  const ipcJson = {
    type: 'emit_event',
    event_type: 'agent.task.completed',
    payload: { task_id: 'abc-123', result: 'ok' },
    source: 'container:worker-2',
  };

  // Verify required fields are present
  assert('type' in ipcJson, 'IPC JSON has type field');
  assert('event_type' in ipcJson, 'IPC JSON has event_type field');
  assert('payload' in ipcJson, 'IPC JSON has payload field');
  assert('source' in ipcJson, 'IPC JSON has source field');

  // Verify field values
  assertEq(ipcJson.type, 'emit_event', 'type field is emit_event');
  assert(
    typeof ipcJson.event_type === 'string' && ipcJson.event_type.length > 0,
    'event_type is a non-empty string',
  );
  assert(
    typeof ipcJson.payload === 'object' && ipcJson.payload !== null,
    'payload is an object',
  );
  assert(
    typeof ipcJson.source === 'string' &&
      ipcJson.source.startsWith('container:'),
    'source starts with container:',
  );

  // Verify it round-trips through JSON correctly
  const serialized = JSON.stringify(ipcJson);
  const parsed = JSON.parse(serialized) as typeof ipcJson;
  assertEq(parsed.type, ipcJson.type, 'type survives JSON round-trip');
  assertEq(
    parsed.event_type,
    ipcJson.event_type,
    'event_type survives JSON round-trip',
  );
  assertEq(
    JSON.stringify(parsed.payload),
    JSON.stringify(ipcJson.payload),
    'payload survives JSON round-trip',
  );
  assertEq(parsed.source, ipcJson.source, 'source survives JSON round-trip');
}

// ─── Runner ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('=== IPC Emit Tests ===');

  await testFileBasedIpcSimulation();
  await testNonMainGroupCanEmit();
  await testIpcJsonFormatValidation();

  console.log('\n=== Done ===');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
