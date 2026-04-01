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
    rules: [
      {
        name: 'r1',
        trigger: { event: 'test.event' },
        actions: [{ type: 'emit', event: 'chained' }],
      },
    ],
    ...overrides,
  };
}

describe('PolicyEngine', () => {
  it('processes an event and fires matching policy', async () => {
    const engine = new PolicyEngine(store, { sendMessage: async () => {} });
    const policy = makePolicy();

    store.emit('test.event', { key: 'val' }, 'test');
    await engine.processOnce([policy]);

    const events = store.getUnprocessed(10);
    expect(events.some((e) => e.event_type === 'chained')).toBe(true);
  });

  it('does not fire when event type does not match', async () => {
    const engine = new PolicyEngine(store, { sendMessage: async () => {} });
    const policy = makePolicy();

    store.emit('other.event', {}, 'test');
    await engine.processOnce([policy]);

    const events = store.getUnprocessed(10);
    expect(events.every((e) => e.event_type !== 'chained')).toBe(true);
  });

  it('supports glob patterns in trigger', async () => {
    const engine = new PolicyEngine(store, { sendMessage: async () => {} });
    const policy = makePolicy({
      rules: [
        {
          name: 'glob-rule',
          trigger: { event: 'boi.*' },
          actions: [{ type: 'emit', event: 'matched' }],
        },
      ],
    });

    store.emit('boi.spec.completed', {}, 'test');
    await engine.processOnce([policy]);

    const events = store.getUnprocessed(10);
    expect(events.some((e) => e.event_type === 'matched')).toBe(true);
  });

  it('evaluates conditions before firing', async () => {
    const engine = new PolicyEngine(store, { sendMessage: async () => {} });
    const policy = makePolicy({
      rules: [
        {
          name: 'conditional',
          trigger: { event: 'test.event' },
          conditions: [{ field: 'status', op: 'eq', value: 'done' }],
          actions: [{ type: 'emit', event: 'fired' }],
        },
      ],
    });

    store.emit('test.event', { status: 'pending' }, 'test');
    await engine.processOnce([policy]);

    const events = store.getUnprocessed(10);
    expect(events.every((e) => e.event_type !== 'fired')).toBe(true);
  });

  it('logs evaluation details', async () => {
    const engine = new PolicyEngine(store, { sendMessage: async () => {} });
    const policy = makePolicy();

    const eventId = store.emit('test.event', {}, 'test');
    await engine.processOnce([policy]);

    const evalLogs = store.getEvalLogs(eventId);
    expect(evalLogs.length).toBeGreaterThan(0);
    expect(evalLogs[0].policy_name).toBe('test');
  });

  it('handles oneshot-disable lifecycle', async () => {
    const engine = new PolicyEngine(store, { sendMessage: async () => {} });
    const policy = makePolicy({ lifecycle: 'oneshot-disable' });

    store.emit('test.event', {}, 'test');
    const result = await engine.processOnce([policy]);

    expect(policy.enabled).toBe(false);
    expect(result.disabledPolicies).toContain('test');
  });

  it('handles oneshot-delete lifecycle', async () => {
    const engine = new PolicyEngine(store, { sendMessage: async () => {} });

    db.prepare(
      `INSERT INTO policies (name, yaml_content, source, enabled) VALUES (?, ?, ?, ?)`,
    ).run('delete-me', 'name: delete-me', 'test', 1);

    const policy = makePolicy({
      name: 'delete-me',
      lifecycle: 'oneshot-delete',
    });

    store.emit('test.event', {}, 'test');
    const result = await engine.processOnce([policy]);

    expect(policy.enabled).toBe(false);
    expect(result.deletedPolicies).toContain('delete-me');

    const remaining = db
      .prepare('SELECT * FROM policies WHERE name = ?')
      .get('delete-me');
    expect(remaining).toBeUndefined();
  });

  it('oneshot-disable persists to DB', async () => {
    const engine = new PolicyEngine(store, { sendMessage: async () => {} });

    db.prepare(
      `INSERT INTO policies (name, yaml_content, source, enabled) VALUES (?, ?, ?, ?)`,
    ).run('disable-persist', 'name: disable-persist', 'test', 1);

    const policy = makePolicy({
      name: 'disable-persist',
      lifecycle: 'oneshot-disable',
    });

    store.emit('test.event', {}, 'test');
    await engine.processOnce([policy]);

    const row = db
      .prepare('SELECT enabled FROM policies WHERE name = ?')
      .get('disable-persist') as { enabled: number };
    expect(row.enabled).toBe(0);
  });

  it('rate limits policies', async () => {
    const engine = new PolicyEngine(store, { sendMessage: async () => {} });
    const policy = makePolicy({
      rate_limit: { max_fires: 1, window: '1h' },
    });

    store.emit('test.event', {}, 'test');
    await engine.processOnce([policy]);

    store.emit('test.event', {}, 'test');
    await engine.processOnce([policy]);

    const allChained = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM events WHERE event_type = 'chained'`,
      )
      .get() as { cnt: number };
    expect(allChained.cnt).toBe(1);
  });

  it('processes deferred events when due', () => {
    const engine = new PolicyEngine(store, { sendMessage: async () => {} });

    store.addDeferred(
      'deferred.event',
      { x: 1 },
      'test',
      new Date(Date.now() - 1000).toISOString(),
    );

    engine.processDeferredOnce();

    const events = store.getUnprocessed(10);
    expect(events.some((e) => e.event_type === 'deferred.event')).toBe(true);
  });

  it('awaits message actions properly', async () => {
    let messageSent = false;
    const engine = new PolicyEngine(store, {
      sendMessage: async () => {
        messageSent = true;
      },
    });

    const policy = makePolicy({
      rules: [
        {
          name: 'msg-rule',
          trigger: { event: 'test.event' },
          actions: [{ type: 'message', jid: 'test@jid', text: 'hello' }],
        },
      ],
    });

    store.emit('test.event', {}, 'test');
    await engine.processOnce([policy]);

    expect(messageSent).toBe(true);
  });
});
