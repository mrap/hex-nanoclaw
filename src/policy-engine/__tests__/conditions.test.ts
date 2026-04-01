import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { evaluateConditions } from '../conditions.js';
import { EventStore } from '../event-store.js';
import type { FieldCondition } from '../types.js';

let db: Database.Database;
let store: EventStore;

beforeEach(() => {
  db = new Database(':memory:');
  store = new EventStore(db);
});

afterEach(() => {
  db.close();
});

describe('evaluateConditions', () => {
  it('returns true for empty conditions', () => {
    const { passed } = evaluateConditions([], {}, store);
    expect(passed).toBe(true);
  });

  it('evaluates eq operator', () => {
    const conds: FieldCondition[] = [
      { field: 'status', op: 'eq', value: 'done' },
    ];
    const { passed } = evaluateConditions(conds, { status: 'done' }, store);
    expect(passed).toBe(true);
  });

  it('evaluates neq operator', () => {
    const conds: FieldCondition[] = [
      { field: 'status', op: 'neq', value: 'done' },
    ];
    const { passed } = evaluateConditions(conds, { status: 'pending' }, store);
    expect(passed).toBe(true);
  });

  it('evaluates gt operator', () => {
    const conds: FieldCondition[] = [{ field: 'count', op: 'gt', value: 5 }];
    const { passed } = evaluateConditions(conds, { count: 10 }, store);
    expect(passed).toBe(true);
  });

  it('evaluates contains operator', () => {
    const conds: FieldCondition[] = [
      { field: 'msg', op: 'contains', value: 'error' },
    ];
    const { passed } = evaluateConditions(
      conds,
      { msg: 'fatal error occurred' },
      store,
    );
    expect(passed).toBe(true);
  });

  it('evaluates glob operator', () => {
    const conds: FieldCondition[] = [
      { field: 'path', op: 'glob', value: '*.ts' },
    ];
    const { passed } = evaluateConditions(conds, { path: 'index.ts' }, store);
    expect(passed).toBe(true);
  });

  it('evaluates regex operator', () => {
    const conds: FieldCondition[] = [
      { field: 'id', op: 'regex', value: '^q-\\d+$' },
    ];
    const { passed } = evaluateConditions(conds, { id: 'q-123' }, store);
    expect(passed).toBe(true);
  });

  it('handles invalid regex gracefully', () => {
    const conds: FieldCondition[] = [
      { field: 'id', op: 'regex', value: '[invalid(' },
    ];
    const { passed, details } = evaluateConditions(conds, { id: 'anything' }, store);
    expect(passed).toBe(false);
    expect(details[0].passed).toBe(false);
  });

  it('resolves nested payload fields', () => {
    const conds: FieldCondition[] = [
      { field: 'payload.task.status', op: 'eq', value: 'ok' },
    ];
    const { passed } = evaluateConditions(
      conds,
      { payload: { task: { status: 'ok' } } },
      store,
    );
    expect(passed).toBe(true);
  });

  it('returns false for missing field', () => {
    const conds: FieldCondition[] = [
      { field: 'missing', op: 'eq', value: 'x' },
    ];
    const { passed } = evaluateConditions(conds, {}, store);
    expect(passed).toBe(false);
  });

  it('short-circuits AND logic', () => {
    const conds: FieldCondition[] = [
      { field: 'a', op: 'eq', value: 'wrong' },
      { field: 'b', op: 'eq', value: 'x' },
    ];
    const { passed, details } = evaluateConditions(
      conds,
      { a: 'right', b: 'x' },
      store,
    );
    expect(passed).toBe(false);
    expect(details[0].passed).toBe(false);
    expect(details[1].passed).toBe('not_evaluated');
  });

  it('evaluates count() function', () => {
    store.emit('crash', {}, 'test');
    store.emit('crash', {}, 'test');
    store.emit('crash', {}, 'test');

    const conds: FieldCondition[] = [
      { field: 'count(crash, 3600)', op: 'gte', value: 3 },
    ];
    const { passed } = evaluateConditions(conds, {}, store);
    expect(passed).toBe(true);
  });

  it('returns details for all conditions', () => {
    const conds: FieldCondition[] = [
      { field: 'a', op: 'eq', value: 1 },
      { field: 'b', op: 'eq', value: 2 },
    ];
    const { passed, details } = evaluateConditions(
      conds,
      { a: 1, b: 2 },
      store,
    );
    expect(passed).toBe(true);
    expect(details).toHaveLength(2);
    expect(details[0]).toEqual({
      field: 'a',
      op: 'eq',
      expected: 1,
      actual: 1,
      passed: true,
    });
    expect(details[1]).toEqual({
      field: 'b',
      op: 'eq',
      expected: 2,
      actual: 2,
      passed: true,
    });
  });
});
