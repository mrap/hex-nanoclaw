import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { EventStore } from '../event-store.js';
import { PolicyEngine } from '../engine.js';
import type { Policy } from '../types.js';

let db: Database.Database;
let store: EventStore;

beforeEach(() => {
  db = new Database(':memory:');
  store = new EventStore(db);
});

afterEach(() => {
  db.close();
});

function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    name: 'test',
    lifecycle: 'persistent',
    enabled: true,
    rules: [{
      name: 'r1',
      trigger: { event: 'test.event' },
      actions: [{ type: 'emit', event: 'chained' }],
    }],
    ...overrides,
  };
}

describe('PolicyEngine', () => {
  it('processes an event and fires matching policy', () => {
    const engine = new PolicyEngine(store, { sendMessage: async () => {} });
    const policy = makePolicy();

    store.emit('test.event', { key: 'val' }, 'test');
    engine.processOnce([policy]);

    // Chained event should be emitted
    const events = store.getUnprocessed(10);
    expect(events.some(e => e.event_type === 'chained')).toBe(true);
  });

  it('does not fire when event type does not match', () => {
    const engine = new PolicyEngine(store, { sendMessage: async () => {} });
    const policy = makePolicy();

    store.emit('other.event', {}, 'test');
    engine.processOnce([policy]);

    const events = store.getUnprocessed(10);
    expect(events.every(e => e.event_type !== 'chained')).toBe(true);
  });

  it('supports glob patterns in trigger', () => {
    const engine = new PolicyEngine(store, { sendMessage: async () => {} });
    const policy = makePolicy({
      rules: [{
        name: 'glob-rule',
        trigger: { event: 'boi.*' },
        actions: [{ type: 'emit', event: 'matched' }],
      }],
    });

    store.emit('boi.spec.completed', {}, 'test');
    engine.processOnce([policy]);

    const events = store.getUnprocessed(10);
    expect(events.some(e => e.event_type === 'matched')).toBe(true);
  });

  it('evaluates conditions before firing', () => {
    const engine = new PolicyEngine(store, { sendMessage: async () => {} });
    const policy = makePolicy({
      rules: [{
        name: 'conditional',
        trigger: { event: 'test.event' },
        conditions: [{ field: 'status', op: 'eq', value: 'done' }],
        actions: [{ type: 'emit', event: 'fired' }],
      }],
    });

    // Should NOT fire — condition fails
    store.emit('test.event', { status: 'pending' }, 'test');
    engine.processOnce([policy]);

    const events = store.getUnprocessed(10);
    expect(events.every(e => e.event_type !== 'fired')).toBe(true);
  });

  it('logs evaluation details', () => {
    const engine = new PolicyEngine(store, { sendMessage: async () => {} });
    const policy = makePolicy();

    const eventId = store.emit('test.event', {}, 'test');
    engine.processOnce([policy]);

    const evalLogs = store.getEvalLogs(eventId);
    expect(evalLogs.length).toBeGreaterThan(0);
    expect(evalLogs[0].policy_name).toBe('test');
  });

  it('handles oneshot-disable lifecycle', () => {
    const engine = new PolicyEngine(store, { sendMessage: async () => {} });
    const policy = makePolicy({ lifecycle: 'oneshot-disable' });

    store.emit('test.event', {}, 'test');
    engine.processOnce([policy]);

    expect(policy.enabled).toBe(false);
  });

  it('rate limits policies', () => {
    const engine = new PolicyEngine(store, { sendMessage: async () => {} });
    const policy = makePolicy({
      rate_limit: { max_fires: 1, window: '1h' },
    });

    store.emit('test.event', {}, 'test');
    engine.processOnce([policy]);

    store.emit('test.event', {}, 'test');
    engine.processOnce([policy]);

    // Second event should be rate-limited — only one 'chained' event total in DB
    const allChained = db.prepare(
      `SELECT COUNT(*) as cnt FROM events WHERE event_type = 'chained'`
    ).get() as { cnt: number };
    expect(allChained.cnt).toBe(1);
  });

  it('processes deferred events when due', () => {
    const engine = new PolicyEngine(store, { sendMessage: async () => {} });

    // Manually add a deferred event that's already past due
    store.addDeferred('deferred.event', { x: 1 }, 'test', new Date(Date.now() - 1000).toISOString());

    engine.processDeferredOnce();

    const events = store.getUnprocessed(10);
    expect(events.some(e => e.event_type === 'deferred.event')).toBe(true);
  });
});
