import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { EventStore } from '../event-store.js';
import { executeEmit } from '../actions/emit.js';
import { executeShell } from '../actions/shell.js';
import { executeSchedule } from '../actions/schedule.js';
import { executeMessage } from '../actions/message.js';
import type { EmitAction, ShellAction, ScheduleAction, MessageAction } from '../types.js';

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
    executeEmit(action, {}, store);
  });
});

describe('shell action', () => {
  it('executes a shell command', () => {
    const action: ShellAction = { type: 'shell', command: 'echo hello' };
    const result = executeShell(action, {});
    expect(result.status).toBe('success');
    expect(result.output).toContain('hello');
  });

  it('reports failure on bad command', () => {
    const action: ShellAction = { type: 'shell', command: 'false' };
    const result = executeShell(action, {});
    expect(result.status).toBe('error');
  });

  it('interpolates templates in command with shell escaping', () => {
    const action: ShellAction = { type: 'shell', command: 'echo {{ event.name }}' };
    const result = executeShell(action, { name: 'world' });
    expect(result.output).toContain('world');
  });

  it('respects timeout', () => {
    const action: ShellAction = { type: 'shell', command: 'sleep 10', timeout: 1 };
    const result = executeShell(action, {});
    expect(result.status).toBe('error');
  });

  it('escapes values with single quotes', () => {
    const action: ShellAction = { type: 'shell', command: 'echo {{ event.val }}' };
    const result = executeShell(action, { val: "it's" });
    expect(result.status).toBe('success');
    expect(result.output).toContain("it's");
  });

  it('prevents command injection via semicolons', () => {
    const action: ShellAction = { type: 'shell', command: 'echo {{ event.val }}' };
    const result = executeShell(action, { val: 'safe; echo INJECTED' });
    expect(result.status).toBe('success');
    expect(result.output).not.toContain('INJECTED\n');
    expect(result.output).toContain('safe; echo INJECTED');
  });

  it('prevents command injection via backticks', () => {
    const action: ShellAction = { type: 'shell', command: 'echo {{ event.val }}' };
    const result = executeShell(action, { val: '`echo INJECTED`' });
    expect(result.status).toBe('success');
    expect(result.output).not.toBe('INJECTED');
  });

  it('prevents command injection via $() subshell', () => {
    const action: ShellAction = { type: 'shell', command: 'echo {{ event.val }}' };
    const result = executeShell(action, { val: '$(echo INJECTED)' });
    expect(result.status).toBe('success');
    expect(result.output).not.toBe('INJECTED');
  });

  it('prevents command injection via pipes', () => {
    const action: ShellAction = { type: 'shell', command: 'echo {{ event.val }}' };
    const result = executeShell(action, { val: 'safe | cat /etc/passwd' });
    expect(result.status).toBe('success');
    expect(result.output).toContain('safe | cat /etc/passwd');
  });
});

describe('schedule action', () => {
  it('creates a scheduled task', () => {
    let createdTask: Record<string, unknown> | null = null;
    const deps = {
      createTask: (task: Record<string, unknown>) => { createdTask = task; },
      findGroupJid: (group: string) => group === 'test-group' ? 'jid@test' : undefined,
    };

    const action: ScheduleAction = {
      type: 'schedule',
      group: 'test-group',
      prompt: 'do something',
      schedule_type: 'once',
      schedule_value: 'now',
    };

    const result = executeSchedule(action, {}, deps);
    expect(result.status).toBe('success');
    expect(result.taskId).toBeDefined();
    expect(createdTask).not.toBeNull();
    expect(createdTask!.prompt).toBe('do something');
    expect(createdTask!.chat_jid).toBe('jid@test');
  });

  it('returns error for unknown group', () => {
    const deps = {
      createTask: () => {},
      findGroupJid: () => undefined,
    };

    const action: ScheduleAction = {
      type: 'schedule',
      group: 'nonexistent',
      prompt: 'do something',
      schedule_type: 'once',
      schedule_value: 'now',
    };

    const result = executeSchedule(action, {}, deps);
    expect(result.status).toBe('error');
    expect(result.error).toContain('Group not found');
  });
});

describe('message action', () => {
  it('sends a message', async () => {
    let sentJid = '';
    let sentText = '';
    const deps = {
      sendMessage: async (jid: string, text: string) => {
        sentJid = jid;
        sentText = text;
      },
    };

    const action: MessageAction = { type: 'message', jid: 'user@jid', text: 'hello world' };
    const result = await executeMessage(action, {}, deps);
    expect(result.status).toBe('success');
    expect(sentJid).toBe('user@jid');
    expect(sentText).toBe('hello world');
  });

  it('interpolates templates in text', async () => {
    let sentText = '';
    const deps = {
      sendMessage: async (_jid: string, text: string) => { sentText = text; },
    };

    const action: MessageAction = { type: 'message', jid: 'user@jid', text: 'Spec {{ event.spec_id }} completed' };
    const result = await executeMessage(action, { spec_id: 'q-100' }, deps);
    expect(result.status).toBe('success');
    expect(sentText).toBe('Spec q-100 completed');
  });

  it('returns error on failure', async () => {
    const deps = {
      sendMessage: async () => { throw new Error('network error'); },
    };

    const action: MessageAction = { type: 'message', jid: 'user@jid', text: 'hello' };
    const result = await executeMessage(action, {}, deps);
    expect(result.status).toBe('error');
    expect(result.error).toContain('network error');
  });
});
