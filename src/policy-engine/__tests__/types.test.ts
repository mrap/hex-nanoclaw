import { describe, it, expect } from 'vitest';
import type {
  Policy,
  Rule,
  FieldCondition,
  ShellCondition,
  EmitAction,
  ShellAction,
  ScheduleAction,
  MessageAction,
  ParsedEvent,
  ConditionDetail,
  PolicyEvalResult,
  ActionResult,
} from '../types.js';

describe('Policy Engine Types', () => {
  it('constructs a valid policy', () => {
    const policy: Policy = {
      name: 'test-policy',
      lifecycle: 'persistent',
      enabled: true,
      rules: [
        {
          name: 'test-rule',
          trigger: { event: 'test.event' },
          conditions: [{ field: 'status', op: 'eq', value: 'done' }],
          actions: [{ type: 'emit', event: 'test.chained' }],
        },
      ],
    };
    expect(policy.name).toBe('test-policy');
    expect(policy.rules).toHaveLength(1);
  });

  it('supports all action types', () => {
    const actions = [
      { type: 'emit' as const, event: 'x' },
      { type: 'shell' as const, command: 'echo hi' },
      {
        type: 'schedule' as const,
        group: 'main',
        prompt: 'do it',
        schedule_type: 'once' as const,
        schedule_value: 'now',
      },
      { type: 'message' as const, jid: 'test@jid', text: 'hello' },
    ];
    expect(actions).toHaveLength(4);
  });

  it('supports both condition types', () => {
    const field: FieldCondition = { field: 'x', op: 'eq', value: 1 };
    const shell: ShellCondition = { type: 'shell', command: 'test -f /tmp/x' };
    expect(field.op).toBe('eq');
    expect(shell.type).toBe('shell');
  });
});
