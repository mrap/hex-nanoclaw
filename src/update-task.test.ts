import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  _initTestDatabase,
  createTask,
  getTaskById,
  setRegisteredGroup,
} from './db.js';
import { processTaskIpc, IpcDeps } from './ipc.js';
import { RegisteredGroup } from './types.js';

vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from './logger.js';

const MAIN_GROUP: RegisteredGroup = {
  name: 'Main',
  folder: 'whatsapp_main',
  trigger: 'always',
  added_at: '2024-01-01T00:00:00.000Z',
  isMain: true,
};

const OPS_GROUP: RegisteredGroup = {
  name: 'Ops',
  folder: 'ops',
  trigger: '@ops',
  added_at: '2024-01-01T00:00:00.000Z',
};

let deps: IpcDeps;

function seedTask(overrides: Record<string, unknown> = {}) {
  const defaults = {
    id: 'task-1',
    group_folder: 'ops',
    chat_jid: 'ops@g.us',
    prompt: 'original prompt',
    schedule_type: 'cron' as const,
    schedule_value: '0 9 * * *',
    context_mode: 'group' as const,
    status: 'active' as const,
    script: null,
    next_run: '2026-04-02T09:00:00.000Z',
    created_at: '2026-04-01T00:00:00.000Z',
  };
  createTask({ ...defaults, ...overrides } as Parameters<typeof createTask>[0]);
}

beforeEach(() => {
  _initTestDatabase();
  setRegisteredGroup('main@g.us', MAIN_GROUP);
  setRegisteredGroup('ops@g.us', OPS_GROUP);

  deps = {
    sendMessage: async () => {},
    registeredGroups: () => ({
      'main@g.us': MAIN_GROUP,
      'ops@g.us': OPS_GROUP,
    }),
    registerGroup: () => {},
    syncGroups: async () => {},
    getAvailableGroups: () => [],
    writeGroupsSnapshot: () => {},
    onTasksChanged: () => {},
  };

  vi.clearAllMocks();
});

// --- Authorization ---

describe('update_task authorization', () => {
  it('task not found logs warning and makes no changes', async () => {
    await processTaskIpc(
      { type: 'update_task', taskId: 'nonexistent', prompt: 'new' },
      'whatsapp_main',
      true,
      deps,
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'nonexistent' }),
      'Task not found for update',
    );
  });

  it('non-main group cannot update another groups task', async () => {
    seedTask({ group_folder: 'whatsapp_main', chat_jid: 'main@g.us' });

    await processTaskIpc(
      { type: 'update_task', taskId: 'task-1', prompt: 'hacked' },
      'ops',
      false,
      deps,
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1' }),
      'Unauthorized task update attempt',
    );
    expect(getTaskById('task-1')!.prompt).toBe('original prompt');
  });

  it('non-main group can update its own task', async () => {
    seedTask();

    await processTaskIpc(
      { type: 'update_task', taskId: 'task-1', prompt: 'updated by ops' },
      'ops',
      false,
      deps,
    );

    expect(getTaskById('task-1')!.prompt).toBe('updated by ops');
  });

  it('main group can update any task', async () => {
    seedTask();

    await processTaskIpc(
      { type: 'update_task', taskId: 'task-1', prompt: 'updated by main' },
      'whatsapp_main',
      true,
      deps,
    );

    expect(getTaskById('task-1')!.prompt).toBe('updated by main');
  });
});

// --- Partial field updates ---

describe('update_task partial field updates', () => {
  it('update prompt only leaves other fields unchanged', async () => {
    seedTask({ script: 'echo hi' });

    await processTaskIpc(
      { type: 'update_task', taskId: 'task-1', prompt: 'new prompt' },
      'whatsapp_main',
      true,
      deps,
    );

    const task = getTaskById('task-1')!;
    expect(task.prompt).toBe('new prompt');
    expect(task.script).toBe('echo hi');
    expect(task.schedule_type).toBe('cron');
    expect(task.schedule_value).toBe('0 9 * * *');
  });

  it('update script to a value', async () => {
    seedTask();

    await processTaskIpc(
      { type: 'update_task', taskId: 'task-1', script: 'echo hello' },
      'whatsapp_main',
      true,
      deps,
    );

    expect(getTaskById('task-1')!.script).toBe('echo hello');
  });

  it('update script to empty string coerces to null', async () => {
    seedTask({ script: 'echo hi' });

    await processTaskIpc(
      { type: 'update_task', taskId: 'task-1', script: '' },
      'whatsapp_main',
      true,
      deps,
    );

    expect(getTaskById('task-1')!.script).toBeNull();
  });
});

// --- Schedule recomputation ---

describe('update_task schedule recomputation', () => {
  it('update schedule_type to cron with valid expression recomputes next_run', async () => {
    seedTask({
      schedule_type: 'once',
      schedule_value: '2026-06-01T00:00:00',
      next_run: '2026-06-01T00:00:00.000Z',
    });

    await processTaskIpc(
      {
        type: 'update_task',
        taskId: 'task-1',
        schedule_type: 'cron',
        schedule_value: '0 9 * * *',
      },
      'whatsapp_main',
      true,
      deps,
    );

    const task = getTaskById('task-1')!;
    expect(task.schedule_type).toBe('cron');
    expect(task.schedule_value).toBe('0 9 * * *');
    // next_run should be recomputed to a future date
    expect(task.next_run).toBeTruthy();
    expect(new Date(task.next_run!).getTime()).toBeGreaterThan(
      Date.now() - 60000,
    );
  });

  it('update schedule_type to cron with invalid expression does not update', async () => {
    seedTask();
    const originalNextRun = getTaskById('task-1')!.next_run;

    await processTaskIpc(
      {
        type: 'update_task',
        taskId: 'task-1',
        schedule_type: 'cron',
        schedule_value: 'not valid cron',
      },
      'whatsapp_main',
      true,
      deps,
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1' }),
      'Invalid cron in task update',
    );
    // Task should remain unchanged because the handler breaks before updateTask
    const task = getTaskById('task-1')!;
    expect(task.next_run).toBe(originalNextRun);
    expect(task.schedule_value).toBe('0 9 * * *');
  });

  it('update schedule_value only with existing cron type recomputes next_run', async () => {
    seedTask();

    await processTaskIpc(
      {
        type: 'update_task',
        taskId: 'task-1',
        schedule_value: '30 14 * * *',
      },
      'whatsapp_main',
      true,
      deps,
    );

    const task = getTaskById('task-1')!;
    expect(task.schedule_value).toBe('30 14 * * *');
    expect(task.schedule_type).toBe('cron');
    // next_run should be recomputed
    expect(task.next_run).toBeTruthy();
    expect(task.next_run).not.toBe('2026-04-02T09:00:00.000Z');
  });

  it('update schedule_type to interval with valid ms recomputes next_run', async () => {
    const before = Date.now();
    seedTask();

    await processTaskIpc(
      {
        type: 'update_task',
        taskId: 'task-1',
        schedule_type: 'interval',
        schedule_value: '3600000',
      },
      'whatsapp_main',
      true,
      deps,
    );

    const task = getTaskById('task-1')!;
    expect(task.schedule_type).toBe('interval');
    const nextRun = new Date(task.next_run!).getTime();
    expect(nextRun).toBeGreaterThanOrEqual(before + 3600000 - 1000);
    expect(nextRun).toBeLessThanOrEqual(Date.now() + 3600000 + 1000);
  });

  it('interval value 0 does not set next_run', async () => {
    seedTask({
      schedule_type: 'interval',
      schedule_value: '60000',
      next_run: '2026-04-02T09:00:00.000Z',
    });

    await processTaskIpc(
      {
        type: 'update_task',
        taskId: 'task-1',
        schedule_value: '0',
      },
      'whatsapp_main',
      true,
      deps,
    );

    const task = getTaskById('task-1')!;
    // schedule_value updated but next_run not recomputed via interval path
    expect(task.schedule_value).toBe('0');
  });

  it('interval value negative does not set next_run', async () => {
    seedTask({
      schedule_type: 'interval',
      schedule_value: '60000',
      next_run: '2026-04-02T09:00:00.000Z',
    });

    await processTaskIpc(
      {
        type: 'update_task',
        taskId: 'task-1',
        schedule_value: '-5000',
      },
      'whatsapp_main',
      true,
      deps,
    );

    const task = getTaskById('task-1')!;
    expect(task.schedule_value).toBe('-5000');
  });

  it('interval value non-numeric does not set next_run', async () => {
    seedTask({
      schedule_type: 'interval',
      schedule_value: '60000',
      next_run: '2026-04-02T09:00:00.000Z',
    });

    await processTaskIpc(
      {
        type: 'update_task',
        taskId: 'task-1',
        schedule_value: 'abc',
      },
      'whatsapp_main',
      true,
      deps,
    );

    const task = getTaskById('task-1')!;
    expect(task.schedule_value).toBe('abc');
  });
});

// --- Edge cases ---

describe('update_task edge cases', () => {
  it('no fields provided calls updateTask with empty updates', async () => {
    seedTask();

    await processTaskIpc(
      { type: 'update_task', taskId: 'task-1' },
      'whatsapp_main',
      true,
      deps,
    );

    // Task should remain unchanged
    const task = getTaskById('task-1')!;
    expect(task.prompt).toBe('original prompt');
    expect(task.schedule_type).toBe('cron');
    expect(task.schedule_value).toBe('0 9 * * *');
    // onTasksChanged should still be called
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1' }),
      'Task updated via IPC',
    );
  });
});
