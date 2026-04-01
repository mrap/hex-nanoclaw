import path from 'path';
import { fileURLToPath } from 'url';

import {
  createTestContext,
  getEvents,
  getActionLogs,
  assert,
  assertEq,
} from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const policyDir = path.join(ROOT, 'config', 'policies');

// ─── Test 1: boi.spec.completed → boi.result.ready ────────────────────────
async function testBoiSpecCompleted(): Promise<void> {
  console.log('\nTest 1: boi.spec.completed → boi.result.ready');
  const ctx = createTestContext(policyDir);
  try {
    ctx.store.emit(
      'boi.spec.completed',
      { spec_id: 'q-500', target_repo: 'hex-nanoclaw', summary: 'Built phase2 tests' },
      'test',
    );

    const policies = ctx.loader.loadAll();
    await ctx.engine.processOnce(policies);

    const events = getEvents(ctx.db);
    const resultEvent = events.find((e) => e.event_type === 'boi.result.ready');
    assert(resultEvent !== undefined, 'boi.result.ready event emitted');

    const payload = JSON.parse(resultEvent!.payload as string) as Record<string, unknown>;
    assertEq(payload.status as string, 'success', 'status is success');
    assertEq(payload.spec_id as string, 'q-500', 'spec_id preserved');
  } finally {
    ctx.cleanup();
  }
}

// ─── Test 2: boi.spec.failed → boi.result.ready with error ────────────────
async function testBoiSpecFailed(): Promise<void> {
  console.log('\nTest 2: boi.spec.failed → boi.result.ready with error');
  const ctx = createTestContext(policyDir);
  try {
    ctx.store.emit(
      'boi.spec.failed',
      { spec_id: 'q-501', error: 'compilation error' },
      'test',
    );

    const policies = ctx.loader.loadAll();
    await ctx.engine.processOnce(policies);

    const events = getEvents(ctx.db);
    const resultEvent = events.find((e) => e.event_type === 'boi.result.ready');
    assert(resultEvent !== undefined, 'boi.result.ready event emitted on failure');

    const payload = JSON.parse(resultEvent!.payload as string) as Record<string, unknown>;
    assertEq(payload.status as string, 'failed', 'status is failed');
    assertEq(payload.spec_id as string, 'q-501', 'spec_id preserved on failure');
  } finally {
    ctx.cleanup();
  }
}

// ─── Test 3: boi.dispatch → schedule action ───────────────────────────────
async function testBoiDispatch(): Promise<void> {
  console.log('\nTest 3: boi.dispatch → schedule action');
  const ctx = createTestContext(policyDir);
  try {
    ctx.store.emit(
      'boi.dispatch',
      { spec_path: '/specs/q-502.md', spec_id: 'q-502' },
      'test',
    );

    const policies = ctx.loader.loadAll();
    await ctx.engine.processOnce(policies);

    const actions = getActionLogs(ctx.db);
    const scheduleAction = actions.find(
      (a) =>
        a.policy_name === 'boi-dispatch-router' &&
        a.action_type === 'schedule',
    );
    assert(
      scheduleAction !== undefined,
      'action_log has schedule action for boi-dispatch-router',
    );
  } finally {
    ctx.cleanup();
  }
}

// ─── Test 4: system.started → session-lifecycle fires ─────────────────────
async function testSystemStarted(): Promise<void> {
  console.log('\nTest 4: system.started → session-lifecycle fires');
  const ctx = createTestContext(policyDir);
  try {
    ctx.store.emit(
      'system.started',
      { timestamp: new Date().toISOString() },
      'test',
    );

    const policies = ctx.loader.loadAll();
    await ctx.engine.processOnce(policies);

    const actions = getActionLogs(ctx.db);
    const shellAction = actions.find(
      (a) =>
        a.policy_name === 'session-lifecycle' && a.action_type === 'shell',
    );
    assert(
      shellAction !== undefined,
      'action_log has shell action for session-lifecycle',
    );
  } finally {
    ctx.cleanup();
  }
}

// ─── Test 5: Unknown event → no policies fire ─────────────────────────────
async function testUnknownEvent(): Promise<void> {
  console.log('\nTest 5: Unknown event → no policies fire');
  const ctx = createTestContext(policyDir);
  try {
    ctx.store.emit('random.unknown.event', {}, 'test');

    const policies = ctx.loader.loadAll();
    await ctx.engine.processOnce(policies);

    const actions = getActionLogs(ctx.db);
    assertEq(actions.length, 0, 'no action_log entries for unknown event');
  } finally {
    ctx.cleanup();
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('=== Phase 2 Policy Tests ===');

  await testBoiSpecCompleted();
  await testBoiSpecFailed();
  await testBoiDispatch();
  await testSystemStarted();
  await testUnknownEvent();

  console.log('\n=== Done ===');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
