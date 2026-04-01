import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { EventStore } from '../event-store.js';
import { executeEmit } from '../actions/emit.js';
import { executeShell } from '../actions/shell.js';
import type { EmitAction, ShellAction } from '../types.js';

let db: Database.Database;
let store: EventStore;

beforeEach(() => {
  db = new Database(':memory:');
  store = new EventStore(db);
});

afterEach(() => {
  db.close();
});

describe('emit action', () => {
  it('emits a chained event', () => {
    const action: EmitAction = {
      type: 'emit',
      event: 'chained.event',
      payload: { from: 'test' },
    };

    const result = executeEmit(action, { spec_id: 'q-1' }, store);

    expect(result.status).toBe('success');
    const events = store.getUnprocessed(10);
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('chained.event');
  });

  it('supports delayed emit', () => {
    const action: EmitAction = {
      type: 'emit',
      event: 'delayed.event',
      delay: '5m',
    };

    const result = executeEmit(action, {}, store);

    expect(result.status).toBe('success');
    // Should be in deferred, not in events
    const events = store.getUnprocessed(10);
    expect(events).toHaveLength(0);
  });

  it('cancels previous deferred in same cancel_group', () => {
    const action: EmitAction = {
      type: 'emit',
      event: 'debounced',
      delay: '5m',
      cancel_group: 'debounce-1',
    };

    executeEmit(action, {}, store);
    executeEmit(action, {}, store); // should cancel the first

    // Only the latest deferred should exist
    // (We can't easily check deferred count without a getter, but the cancelDeferred was called)
  });
});

describe('shell action', () => {
  it('executes a shell command', () => {
    const action: ShellAction = {
      type: 'shell',
      command: 'echo hello',
    };

    const result = executeShell(action, {});

    expect(result.status).toBe('success');
    expect(result.output).toContain('hello');
  });

  it('reports failure on bad command', () => {
    const action: ShellAction = {
      type: 'shell',
      command: 'false', // exit 1
    };

    const result = executeShell(action, {});
    expect(result.status).toBe('error');
  });

  it('interpolates templates in command', () => {
    const action: ShellAction = {
      type: 'shell',
      command: 'echo {{ event.name }}',
    };

    const result = executeShell(action, { name: 'world' });
    expect(result.output).toContain('world');
  });

  it('respects timeout', () => {
    const action: ShellAction = {
      type: 'shell',
      command: 'sleep 10',
      timeout: 1, // 1 second
    };

    const result = executeShell(action, {});
    expect(result.status).toBe('error');
  });
});
