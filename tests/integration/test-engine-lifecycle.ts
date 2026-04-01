import path from 'path';
import { fileURLToPath } from 'url';

import {
  createTestContext,
  getEvents,
  getActionLogs,
  getEvalLogs,
  assert,
  assertEq,
  assertGte,
} from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const policyDir = path.join(__dirname, 'policies');

// ─── Test 1: Basic event processing ─────────────────────────────────────────
async function testBasicEventProcessing(): Promise<void> {
  console.log('\nTest 1: Basic event processing');
  const ctx = createTestContext(policyDir);
  try {
    ctx.store.emit('test.event', { marker: 'hello-world' }, 'test');
    const policies = ctx.loader.loadAll();
    await ctx.engine.processOnce(policies);

    const events = getEvents(ctx.db);
    assertEq(events.length, 1, 'one event in table');
    assert(events[0].processed_at !== null, 'event marked processed');

    const actions = getActionLogs(ctx.db);
    const echoAction = actions.find((a) => a.policy_name === 'test-echo');
    assert(echoAction !== undefined, 'action_log has test-echo entry');
    assertEq(
      echoAction!.action_type as string,
      'shell',
      'action type is shell',
    );
    assertEq(echoAction!.status as string, 'success', 'shell action succeeded');

    const evals = getEvalLogs(ctx.db);
    const echoEval = evals.find(
      (e) => e.policy_name === 'test-echo' && e.action_taken === 1,
    );
    assert(echoEval !== undefined, 'eval_log has action_taken=1 for test-echo');
  } finally {
    ctx.cleanup();
  }
}

// ─── Test 2: Non-matching event ignored ──────────────────────────────────────
async function testNonMatchingEventIgnored(): Promise<void> {
  console.log('\nTest 2: Non-matching event ignored');
  const ctx = createTestContext(policyDir);
  try {
    ctx.store.emit('unknown.event.type', { foo: 'bar' }, 'test');
    const policies = ctx.loader.loadAll();
    await ctx.engine.processOnce(policies);

    const actions = getActionLogs(ctx.db);
    assertEq(actions.length, 0, 'no actions logged for unknown event');
  } finally {
    ctx.cleanup();
  }
}

// ─── Test 3: Oneshot-delete lifecycle ────────────────────────────────────────
async function testOneshotDeleteLifecycle(): Promise<void> {
  console.log('\nTest 3: Oneshot-delete lifecycle');
  const ctx = createTestContext(policyDir);
  try {
    // First fire
    ctx.store.emit('oneshot.trigger', {}, 'test');
    const policies = ctx.loader.loadAll();
    const result = await ctx.engine.processOnce(policies);

    // Verify chained event was emitted
    const eventsAfterFirst = getEvents(ctx.db);
    const chainedEvent = eventsAfterFirst.find(
      (e) => e.event_type === 'oneshot.fired',
    );
    assert(chainedEvent !== undefined, 'oneshot.fired chained event emitted');
    assert(
      result.deletedPolicies.includes('test-oneshot'),
      'result.deletedPolicies includes test-oneshot',
    );

    // Simulate deletion (engine already called store.deletePolicy internally,
    // but we reload policies from loader to confirm it won't fire again)
    const eventsBeforeSecond = getEvents(ctx.db).filter(
      (e) => e.event_type === 'oneshot.fired',
    ).length;

    // Emit trigger again — policy should be gone
    ctx.store.emit('oneshot.trigger', {}, 'test');
    // Reload policies (oneshot was deleted from DB / file won't re-enable it
    // because engine disabled it in-memory; use fresh engine via new context
    // sharing same DB to verify DB-level deletion)
    const freshPolicies = ctx.loader.loadAll();
    await ctx.engine.processOnce(freshPolicies);

    const eventsAfterSecond = getEvents(ctx.db).filter(
      (e) => e.event_type === 'oneshot.fired',
    ).length;
    assertEq(
      eventsAfterSecond,
      eventsBeforeSecond,
      'no second oneshot.fired event after policy deleted',
    );
  } finally {
    ctx.cleanup();
  }
}

// ─── Test 4: Rate limiting ───────────────────────────────────────────────────
async function testRateLimiting(): Promise<void> {
  console.log('\nTest 4: Rate limiting');
  const ctx = createTestContext(policyDir);
  try {
    const policies = ctx.loader.loadAll();

    // First fire
    ctx.store.emit('rate.test', {}, 'test');
    await ctx.engine.processOnce(policies);

    const afterFirst = getEvents(ctx.db).filter(
      (e) => e.event_type === 'rate.fired',
    ).length;
    assertEq(afterFirst, 1, 'rate.fired emitted after first event');

    // Second fire — should be rate limited
    ctx.store.emit('rate.test', {}, 'test');
    await ctx.engine.processOnce(policies);

    const afterSecond = getEvents(ctx.db).filter(
      (e) => e.event_type === 'rate.fired',
    ).length;
    assertEq(afterSecond, 1, 'still only 1 rate.fired after second event');

    const evals = getEvalLogs(ctx.db);
    const rateLimitedEval = evals.find(
      (e) => e.policy_name === 'test-rate-limit' && e.rate_limited === 1,
    );
    assert(rateLimitedEval !== undefined, 'eval_log has rate_limited=1 entry');
  } finally {
    ctx.cleanup();
  }
}

// ─── Test 5: Deferred events ─────────────────────────────────────────────────
async function testDeferredEvents(): Promise<void> {
  console.log('\nTest 5: Deferred events');
  const ctx = createTestContext(policyDir);
  try {
    // Add a deferred event with a past fire_at time
    const pastTime = new Date(Date.now() - 5000).toISOString();
    ctx.store.addDeferred(
      'deferred.test',
      { source: 'deferred' },
      'test',
      pastTime,
    );

    // Process deferred events
    ctx.engine.processDeferredOnce();

    // The deferred event should now be in the events table
    const events = getEvents(ctx.db);
    const deferredEvent = events.find((e) => e.event_type === 'deferred.test');
    assert(
      deferredEvent !== undefined,
      'deferred event promoted to events table',
    );
    assertEq(
      deferredEvent!.payload as string,
      JSON.stringify({ source: 'deferred' }),
      'deferred event payload preserved',
    );
  } finally {
    ctx.cleanup();
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('=== Engine Lifecycle Tests ===');

  await testBasicEventProcessing();
  await testNonMatchingEventIgnored();
  await testOneshotDeleteLifecycle();
  await testRateLimiting();
  await testDeferredEvents();

  console.log('\n=== Done ===');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
