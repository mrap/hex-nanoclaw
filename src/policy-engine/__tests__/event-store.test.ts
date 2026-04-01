import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { EventStore } from '../event-store.js';

let db: Database.Database;
let store: EventStore;

beforeEach(() => {
  db = new Database(':memory:');
  store = new EventStore(db);
});

afterEach(() => {
  db.close();
});

describe('EventStore', () => {
  it('emits and retrieves unprocessed events', () => {
    const id = store.emit('test.event', { key: 'value' }, 'test-source');
    expect(id).toBeGreaterThan(0);

    const events = store.getUnprocessed(10);
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('test.event');
    expect(events[0].source).toBe('test-source');
  });

  it('marks events as processed', () => {
    const id = store.emit('test.event', {}, 'test');
    store.markProcessed(id);

    const events = store.getUnprocessed(10);
    expect(events).toHaveLength(0);
  });

  it('counts events by type within time window', () => {
    store.emit('crash', {}, 'test');
    store.emit('crash', {}, 'test');
    store.emit('other', {}, 'test');

    const count = store.countEvents('crash', 3600); // last hour
    expect(count).toBe(2);
  });

  it('deduplicates by dedup_key', () => {
    store.emit('test', {}, 'test', 'dedup-1');
    store.emit('test', {}, 'test', 'dedup-1'); // duplicate

    const events = store.getUnprocessed(10);
    expect(events).toHaveLength(1);
  });

  it('logs policy evaluation', () => {
    const eventId = store.emit('test', {}, 'test');
    store.logEval({
      event_id: eventId,
      policy_name: 'p1',
      rule_name: 'r1',
      trigger_matched: true,
      conditions_passed: true,
      condition_details: [
        { field: 'x', op: 'eq', expected: 1, actual: 1, passed: true },
      ],
      rate_limited: false,
      action_taken: true,
    });

    const logs = store.getEvalLogs(eventId);
    expect(logs).toHaveLength(1);
    expect(logs[0].policy_name).toBe('p1');
  });

  it('logs action execution', () => {
    const eventId = store.emit('test', {}, 'test');
    store.logAction({
      event_id: eventId,
      policy_name: 'p1',
      rule_name: 'r1',
      action_type: 'emit',
      action_detail: '{}',
      status: 'success',
      error_message: null,
      duration_ms: 5,
    });

    const logs = store.getActionLogs(eventId);
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('success');
  });

  it('stores and retrieves deferred events', () => {
    const futureTime = new Date(Date.now() + 60000).toISOString();
    store.addDeferred('delayed.event', { x: 1 }, 'test', futureTime, 'group-a');

    const due = store.getDueDeferred();
    expect(due).toHaveLength(0); // not due yet

    // Insert one that's already past
    const pastTime = new Date(Date.now() - 1000).toISOString();
    store.addDeferred('past.event', {}, 'test', pastTime);

    const duePast = store.getDueDeferred();
    expect(duePast).toHaveLength(1);
    expect(duePast[0].event_type).toBe('past.event');
  });

  it('cancels deferred events by cancel_group', () => {
    const futureTime = new Date(Date.now() + 60000).toISOString();
    store.addDeferred('a', {}, 'test', futureTime, 'debounce-group');
    store.addDeferred('b', {}, 'test', futureTime, 'debounce-group');

    store.cancelDeferred('debounce-group');

    // Add a new one — the old ones should be gone
    store.addDeferred(
      'c',
      {},
      'test',
      new Date(Date.now() - 1000).toISOString(),
      'debounce-group',
    );
    const due = store.getDueDeferred();
    expect(due).toHaveLength(1);
    expect(due[0].event_type).toBe('c');
  });
});
