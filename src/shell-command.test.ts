import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync } from 'child_process';

import { _initTestDatabase, setRegisteredGroup } from './db.js';
import { processTaskIpc, parseShellCommand, IpcDeps } from './ipc.js';
import { RegisteredGroup } from './types.js';

vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })),
}));

import { logger } from './logger.js';

const HOME = process.env.HOME || '/home/test';

// ---------- parseShellCommand ----------

describe('parseShellCommand', () => {
  it('returns null for empty string', () => {
    expect(parseShellCommand('')).toBeNull();
  });

  it('returns null for whitespace only', () => {
    expect(parseShellCommand('   ')).toBeNull();
  });

  it('returns null for single word (no matching prefix)', () => {
    expect(parseShellCommand('python3')).toBeNull();
  });

  it('returns null for wrong binary', () => {
    expect(
      parseShellCommand(`node ${HOME}/.boi/lib/coordination.py`),
    ).toBeNull();
  });

  it('returns null for wrong fixed arg path', () => {
    expect(parseShellCommand(`python3 ${HOME}/.boi/lib/wrong.py`)).toBeNull();
  });

  it('returns valid result for exact prefix match (coordination)', () => {
    const result = parseShellCommand(
      `python3 ${HOME}/.boi/lib/coordination.py`,
    );
    expect(result).not.toBeNull();
    expect(result!.binary).toBe('python3');
    expect(result!.args).toEqual([`${HOME}/.boi/lib/coordination.py`]);
    expect(result!.label).toBe('coordination');
  });

  it('returns valid result with user args appended', () => {
    const result = parseShellCommand(
      `python3 ${HOME}/.boi/lib/coordination.py check todo.md`,
    );
    expect(result).not.toBeNull();
    expect(result!.args).toEqual([
      `${HOME}/.boi/lib/coordination.py`,
      'check',
      'todo.md',
    ]);
    expect(result!.label).toBe('coordination');
  });

  it('expands tilde in command to match allowlist', () => {
    const result = parseShellCommand(
      `python3 ~/.boi/lib/coordination.py lock file`,
    );
    expect(result).not.toBeNull();
    expect(result!.binary).toBe('python3');
    expect(result!.args).toEqual([
      `${HOME}/.boi/lib/coordination.py`,
      'lock',
      'file',
    ]);
    expect(result!.label).toBe('coordination');
  });

  it('returns null when user arg contains semicolon', () => {
    expect(
      parseShellCommand(`python3 ${HOME}/.boi/lib/coordination.py ; rm -rf /`),
    ).toBeNull();
  });

  it('returns null when user arg contains pipe', () => {
    expect(
      parseShellCommand(`python3 ${HOME}/.boi/lib/coordination.py | cat`),
    ).toBeNull();
  });

  it('returns null when user arg contains dollar sign', () => {
    expect(
      parseShellCommand(`python3 ${HOME}/.boi/lib/coordination.py $HOME`),
    ).toBeNull();
  });

  it('returns null when user arg contains backtick', () => {
    expect(
      parseShellCommand(`python3 ${HOME}/.boi/lib/coordination.py \`whoami\``),
    ).toBeNull();
  });

  it('returns null when user arg contains ampersand', () => {
    expect(
      parseShellCommand(
        `python3 ${HOME}/.boi/lib/coordination.py & echo pwned`,
      ),
    ).toBeNull();
  });

  it('handles extra spaces between parts', () => {
    const result = parseShellCommand(
      `python3   ${HOME}/.boi/lib/coordination.py   check`,
    );
    expect(result).not.toBeNull();
    expect(result!.args).toEqual([`${HOME}/.boi/lib/coordination.py`, 'check']);
  });

  it('rejects case mismatch in binary (Python3 vs python3)', () => {
    expect(
      parseShellCommand(`Python3 ${HOME}/.boi/lib/coordination.py`),
    ).toBeNull();
  });

  it('allows path traversal in user args (no metachar)', () => {
    const result = parseShellCommand(
      `python3 ${HOME}/.boi/lib/coordination.py ../../../etc/passwd`,
    );
    expect(result).not.toBeNull();
    expect(result!.args).toContain('../../../etc/passwd');
  });

  it('matches boi-dispatch allowlist entry', () => {
    const result = parseShellCommand(
      `bash ${HOME}/.boi/boi dispatch some-spec.yaml`,
    );
    expect(result).not.toBeNull();
    expect(result!.label).toBe('boi-dispatch');
    expect(result!.binary).toBe('bash');
    expect(result!.args).toEqual([
      `${HOME}/.boi/boi`,
      'dispatch',
      'some-spec.yaml',
    ]);
  });
});

// ---------- shell_command IPC handler ----------

describe('shell_command IPC handler', () => {
  const MAIN_GROUP: RegisteredGroup = {
    name: 'Main',
    folder: 'whatsapp_main',
    trigger: 'always',
    added_at: '2024-01-01T00:00:00.000Z',
    isMain: true,
  };

  const OTHER_GROUP: RegisteredGroup = {
    name: 'Other',
    folder: 'other-group',
    trigger: '@Andy',
    added_at: '2024-01-01T00:00:00.000Z',
  };

  let groups: Record<string, RegisteredGroup>;
  let deps: IpcDeps;

  beforeEach(() => {
    _initTestDatabase();
    vi.clearAllMocks();

    groups = {
      'main@g.us': MAIN_GROUP,
      'other@g.us': OTHER_GROUP,
    };

    setRegisteredGroup('main@g.us', MAIN_GROUP);
    setRegisteredGroup('other@g.us', OTHER_GROUP);

    deps = {
      sendMessage: async () => {},
      registeredGroups: () => groups,
      registerGroup: (jid, group) => {
        groups[jid] = group;
        setRegisteredGroup(jid, group);
      },
      syncGroups: async () => {},
      getAvailableGroups: () => [],
      writeGroupsSnapshot: () => {},
      onTasksChanged: () => {},
    };
  });

  it('blocks non-main group and does not execute', async () => {
    await processTaskIpc(
      {
        type: 'shell_command',
        command: `python3 ${HOME}/.boi/lib/coordination.py check`,
      },
      'other-group',
      false,
      deps,
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ sourceGroup: 'other-group' }),
      expect.stringContaining('non-main group'),
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('rejects missing command field', async () => {
    await processTaskIpc(
      { type: 'shell_command' },
      'whatsapp_main',
      true,
      deps,
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('missing or invalid command'),
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('rejects non-string command', async () => {
    await processTaskIpc(
      { type: 'shell_command', command: 123 as any },
      'whatsapp_main',
      true,
      deps,
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('missing or invalid command'),
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('blocks command not in allowlist', async () => {
    await processTaskIpc(
      { type: 'shell_command', command: 'rm -rf /' },
      'whatsapp_main',
      true,
      deps,
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ command: expect.any(String) }),
      expect.stringContaining('BLOCKED'),
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('blocks command with shell metacharacter in args', async () => {
    await processTaskIpc(
      {
        type: 'shell_command',
        command: `python3 ${HOME}/.boi/lib/coordination.py ; rm -rf /`,
      },
      'whatsapp_main',
      true,
      deps,
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ command: expect.any(String) }),
      expect.stringContaining('BLOCKED'),
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('defaults timeout to 10s when not provided', async () => {
    await processTaskIpc(
      {
        type: 'shell_command',
        command: `python3 ${HOME}/.boi/lib/coordination.py check`,
      },
      'whatsapp_main',
      true,
      deps,
    );

    expect(spawnSync).toHaveBeenCalledWith(
      'python3',
      expect.any(Array),
      expect.objectContaining({ timeout: 10_000 }),
    );
  });

  it('caps timeout at 30s (MAX_SHELL_TIMEOUT_S)', async () => {
    await processTaskIpc(
      {
        type: 'shell_command',
        command: `python3 ${HOME}/.boi/lib/coordination.py check`,
        timeout: 999,
      },
      'whatsapp_main',
      true,
      deps,
    );

    expect(spawnSync).toHaveBeenCalledWith(
      'python3',
      expect.any(Array),
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it('executes valid command from main group with shell: false', async () => {
    await processTaskIpc(
      {
        type: 'shell_command',
        command: `python3 ${HOME}/.boi/lib/coordination.py check todo.md`,
      },
      'whatsapp_main',
      true,
      deps,
    );

    expect(spawnSync).toHaveBeenCalledWith(
      'python3',
      [`${HOME}/.boi/lib/coordination.py`, 'check', 'todo.md'],
      expect.objectContaining({
        shell: false,
        encoding: 'utf-8',
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'coordination' }),
      expect.stringContaining('executed'),
    );
  });
});
