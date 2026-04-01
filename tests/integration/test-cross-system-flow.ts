import fs from 'fs';
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
const ACTION_LOG = '/tmp/nanoclaw-test-actions.log';

function cleanupActionLog(): void {
  try {
    fs.unlinkSync(ACTION_LOG);
  } catch {
    // ignore if doesn't exist
  }
}

// ─── Test 1: CLI emit → policy match → shell action ─────────────────────────
async function testCliEmitShellAction(): Promise<void> {
  console.log('\nTest 1: CLI emit → policy match → shell action');
  cleanupActionLog();
  const ctx = createTestContext(policyDir);
  try {
    // Raw INSERT like nanoclaw-emit.sh does
    ctx.db
      .prepare(
        `INSERT INTO events (event_type, payload, source) VALUES (?, ?, ?)`,
      )
      .run('test.event', JSON.stringify({ marker: 'cli-test-marker' }), 'cli');

    const events = getEvents(ctx.db);
    assertEq(events.length, 1, 'one event inserted');
    assert(
      events[0].processed_at === null,
      'event is unprocessed before processing',
    );

    const policies = ctx.loader.loadAll();
    await ctx.engine.processOnce(policies);

    const processed = getEvents(ctx.db);
    assert(
      processed[0].processed_at !== null,
      'event marked processed after processOnce',
    );

    const actions = getActionLogs(ctx.db);
    const echoAction = actions.find((a) => a.policy_name === 'test-echo');
    assert(echoAction !== undefined, 'test-echo policy fired');
    assertEq(
      echoAction!.action_type as string,
      'shell',
      'action type is shell',
    );
    assertEq(echoAction!.status as string, 'success', 'shell action succeeded');

    // Verify the shell command actually wrote to the log file
    assert(
      fs.existsSync(ACTION_LOG),
      'shell action wrote to /tmp/nanoclaw-test-actions.log',
    );
    const logContent = fs.readFileSync(ACTION_LOG, 'utf-8');
    assert(
      logContent.includes('policy-fired:cli-test-marker'),
      'log file contains expected marker value',
    );
  } finally {
    ctx.cleanup();
    cleanupActionLog();
  }
}

// ─── Test 2: Event chain: boi.completed → review.requested ──────────────────
async function testEventChainBoiCompleted(): Promise<void> {
  console.log('\nTest 2: Event chain: boi.completed → review.requested');
  const ctx = createTestContext(policyDir);
  try {
    ctx.store.emit(
      'boi.spec.completed',
      { spec_id: 'q-999', status: 'success' },
      'test',
    );

    const policies = ctx.loader.loadAll();
    await ctx.engine.processOnce(policies);

    const events = getEvents(ctx.db);
    const chainedEvent = events.find(
      (e) => e.event_type === 'review.requested',
    );
    assert(chainedEvent !== undefined, 'review.requested chained event exists');

    const payload = JSON.parse(chainedEvent!.payload as string) as Record<
      string,
      unknown
    >;
    assertEq(
      payload.spec_id as string,
      'q-999',
      'chained event has correct spec_id',
    );
    assertEq(
      payload.source as string,
      'auto-chain',
      'chained event has source=auto-chain',
    );

    const actions = getActionLogs(ctx.db);
    const emitAction = actions.find(
      (a) => a.policy_name === 'test-chain' && a.action_type === 'emit',
    );
    assert(
      emitAction !== undefined,
      'action_log has emit action for test-chain',
    );
    assertEq(emitAction!.status as string, 'success', 'emit action succeeded');
  } finally {
    ctx.cleanup();
  }
}

// ─── Test 3: Condition failure blocks action ─────────────────────────────────
async function testConditionFailureBlocksAction(): Promise<void> {
  console.log('\nTest 3: Condition failure blocks action');
  const ctx = createTestContext(policyDir);
  try {
    ctx.store.emit(
      'boi.spec.completed',
      { spec_id: 'q-888', status: 'failure' },
      'test',
    );

    const policies = ctx.loader.loadAll();
    await ctx.engine.processOnce(policies);

    const events = getEvents(ctx.db);
    const chainedEvent = events.find(
      (e) => e.event_type === 'review.requested',
    );
    assert(
      chainedEvent === undefined,
      'NO review.requested event when status=failure',
    );

    const evals = getEvalLogs(ctx.db);
    const chainEval = evals.find((e) => e.policy_name === 'test-chain');
    assert(chainEval !== undefined, 'eval_log has entry for test-chain');
    assertEq(chainEval!.trigger_matched as number, 1, 'trigger_matched=1');
    assertEq(chainEval!.conditions_passed as number, 0, 'conditions_passed=0');
    assertEq(chainEval!.action_taken as number, 0, 'action_taken=0');
  } finally {
    ctx.cleanup();
  }
}

// ─── Test 4: Multiple events in sequence ────────────────────────────────────
async function testMultipleEventsInSequence(): Promise<void> {
  console.log('\nTest 4: Multiple events in sequence');
  cleanupActionLog();
  const ctx = createTestContext(policyDir);
  try {
    // Emit 3 events
    ctx.store.emit('test.event', { marker: 'multi-test' }, 'test');
    ctx.store.emit(
      'boi.spec.completed',
      { spec_id: 'q-100', status: 'success' },
      'test',
    );
    ctx.store.emit('rate.test', {}, 'test');

    const policies = ctx.loader.loadAll();
    await ctx.engine.processOnce(policies);

    const events = getEvents(ctx.db);
    // 3 original + 2 chained (review.requested + rate.fired)
    assertEq(
      events.length,
      5,
      'all 3 original events + 2 chained events = 5 total',
    );

    // All 3 original events should be processed
    const originalEvents = events.slice(0, 3);
    const allProcessed = originalEvents.every((e) => e.processed_at !== null);
    assert(allProcessed, 'all 3 original events processed');

    // Verify correct policies fired
    const actions = getActionLogs(ctx.db);
    const echoAction = actions.find((a) => a.policy_name === 'test-echo');
    assert(echoAction !== undefined, 'test-echo fired for test.event');

    const chainAction = actions.find((a) => a.policy_name === 'test-chain');
    assert(
      chainAction !== undefined,
      'test-chain fired for boi.spec.completed',
    );

    const rateAction = actions.find((a) => a.policy_name === 'test-rate-limit');
    assert(rateAction !== undefined, 'test-rate-limit fired for rate.test');

    // Verify 2 chained events exist
    const reviewEvent = events.find((e) => e.event_type === 'review.requested');
    assert(reviewEvent !== undefined, 'review.requested chained event exists');

    const rateFiredEvent = events.find((e) => e.event_type === 'rate.fired');
    assert(rateFiredEvent !== undefined, 'rate.fired chained event exists');
  } finally {
    ctx.cleanup();
    cleanupActionLog();
  }
}

// ─── Test 5: Full pipeline audit ────────────────────────────────────────────
async function testFullPipelineAudit(): Promise<void> {
  console.log('\nTest 5: Full pipeline audit');
  const ctx = createTestContext(policyDir);
  try {
    // Raw INSERT
    ctx.db
      .prepare(
        `INSERT INTO events (event_type, payload, source) VALUES (?, ?, ?)`,
      )
      .run(
        'test.event',
        JSON.stringify({ marker: 'audit-test' }),
        'audit-source',
      );

    // Verify unprocessed
    const beforeProcess = getEvents(ctx.db);
    assertEq(beforeProcess.length, 1, 'one event before processing');
    assert(
      beforeProcess[0].processed_at === null,
      'event unprocessed before processOnce',
    );

    const policies = ctx.loader.loadAll();
    await ctx.engine.processOnce(policies);

    // Verify processed_at set
    const afterProcess = getEvents(ctx.db);
    assert(
      afterProcess[0].processed_at !== null,
      'processed_at set after processOnce',
    );

    // Verify action_log
    const actions = getActionLogs(ctx.db);
    const echoAction = actions.find((a) => a.policy_name === 'test-echo');
    assert(echoAction !== undefined, 'action_log has test-echo entry');
    assertEq(
      echoAction!.rule_name as string,
      'echo-on-test',
      'action_log has correct rule_name',
    );
    assertEq(
      echoAction!.status as string,
      'success',
      'action_log status=success',
    );
    assert(echoAction!.duration_ms !== null, 'action_log has duration_ms');
    assertGte(echoAction!.duration_ms as number, 0, 'duration_ms >= 0');

    // Verify eval_log shows action_taken
    const evals = getEvalLogs(ctx.db);
    const echoEval = evals.find(
      (e) => e.policy_name === 'test-echo' && e.action_taken === 1,
    );
    assert(echoEval !== undefined, 'eval_log has action_taken=1 for test-echo');
    assertEq(
      echoEval!.trigger_matched as number,
      1,
      'eval_log trigger_matched=1',
    );
  } finally {
    ctx.cleanup();
    cleanupActionLog();
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('=== Cross-System Flow Tests ===');

  await testCliEmitShellAction();
  await testEventChainBoiCompleted();
  await testConditionFailureBlocksAction();
  await testMultipleEventsInSequence();
  await testFullPipelineAudit();

  console.log('\n=== Done ===');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
