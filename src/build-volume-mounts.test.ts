import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';

vi.mock('./config.js', () => ({
  CONTAINER_IMAGE: 'nanoclaw-agent:latest',
  CONTAINER_MAX_OUTPUT_SIZE: 10485760,
  CONTAINER_TIMEOUT: 1800000,
  DATA_DIR: '/tmp/test-data',
  GROUPS_DIR: '/tmp/test-groups',
  IDLE_TIMEOUT: 1800000,
  ONECLI_URL: 'http://localhost:10254',
  TIMEZONE: 'America/Los_Angeles',
}));

vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./mount-security.js', () => ({
  validateAdditionalMounts: vi.fn(() => []),
}));

vi.mock('./container-runtime.js', () => ({
  CONTAINER_RUNTIME_BIN: 'docker',
  hostGatewayArgs: () => [],
  readonlyMountArgs: (h: string, c: string) => ['-v', `${h}:${c}:ro`],
  stopContainer: vi.fn(),
}));

vi.mock('@onecli-sh/sdk', () => ({
  OneCLI: class {
    applyContainerConfig = vi.fn().mockResolvedValue(true);
    createAgent = vi.fn().mockResolvedValue({ id: 'test' });
    ensureAgent = vi
      .fn()
      .mockResolvedValue({ name: 'test', identifier: 'test', created: true });
  },
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(() => false),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn(() => ''),
      readdirSync: vi.fn(() => []),
      statSync: vi.fn(() => ({ isDirectory: () => false, mtimeMs: 0 })),
      copyFileSync: vi.fn(),
      cpSync: vi.fn(),
    },
  };
});

// Mock child_process (required by container-runner module)
vi.mock('child_process', async () => {
  const actual =
    await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    spawn: vi.fn(),
    exec: vi.fn(),
  };
});

import fs from 'fs';
import { buildVolumeMounts } from './container-runner.js';
import type { RegisteredGroup } from './types.js';

// Typed mock references
const mockFs = vi.mocked(fs);

// --- Helpers ---

const DATA_DIR = '/tmp/test-data';
const GROUPS_DIR = '/tmp/test-groups';

function makeGroup(overrides: Partial<RegisteredGroup> = {}): RegisteredGroup {
  return {
    name: 'Test Group',
    folder: 'test-group',
    trigger: '@test',
    added_at: new Date().toISOString(),
    ...overrides,
  };
}

function findMount(
  mounts: { hostPath: string; containerPath: string; readonly: boolean }[],
  containerPath: string,
) {
  return mounts.find((m) => m.containerPath === containerPath);
}

/** Mock existsSync to return true only for the given path(s). */
function existsOnlyAt(...paths: string[]) {
  const pathSet = new Set(paths);
  mockFs.existsSync.mockImplementation(((p: string) =>
    pathSet.has(p)) as typeof fs.existsSync);
}

// --- Tests ---

describe('buildVolumeMounts', () => {
  const projectRoot = process.cwd();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: existsSync returns false unless overridden per test
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readdirSync.mockReturnValue(
      [] as unknown as ReturnType<typeof fs.readdirSync>,
    );
    mockFs.statSync.mockReturnValue({
      isDirectory: () => false,
      mtimeMs: 0,
    } as unknown as ReturnType<typeof fs.statSync>);
  });

  // ---- Main group mounts ----

  describe('main group mounts', () => {
    it('includes project root mount as readonly', () => {
      const mounts = buildVolumeMounts(makeGroup(), true);
      const mount = findMount(mounts, '/workspace/project');
      expect(mount).toBeDefined();
      expect(mount!.hostPath).toBe(projectRoot);
      expect(mount!.readonly).toBe(true);
    });

    it('includes .env shadow mount when .env file exists', () => {
      const envPath = path.join(projectRoot, '.env');
      existsOnlyAt(envPath);

      const mounts = buildVolumeMounts(makeGroup(), true);
      const mount = findMount(mounts, '/workspace/project/.env');
      expect(mount).toBeDefined();
      expect(mount!.hostPath).toBe('/dev/null');
      expect(mount!.readonly).toBe(true);
    });

    it('does not include .env shadow mount when no .env file', () => {
      mockFs.existsSync.mockReturnValue(false);

      const mounts = buildVolumeMounts(makeGroup(), true);
      const mount = findMount(mounts, '/workspace/project/.env');
      expect(mount).toBeUndefined();
    });

    it('includes group folder mount as read-write', () => {
      const mounts = buildVolumeMounts(makeGroup(), true);
      const mount = findMount(mounts, '/workspace/group');
      expect(mount).toBeDefined();
      expect(mount!.hostPath).toBe(path.resolve(GROUPS_DIR, 'test-group'));
      expect(mount!.readonly).toBe(false);
    });

    it('does NOT include global memory mount', () => {
      const globalDir = path.join(GROUPS_DIR, 'global');
      existsOnlyAt(globalDir);

      const mounts = buildVolumeMounts(makeGroup(), true);
      const mount = findMount(mounts, '/workspace/global');
      expect(mount).toBeUndefined();
    });
  });

  // ---- Non-main group mounts ----

  describe('non-main group mounts', () => {
    it('does NOT include project root mount', () => {
      const mounts = buildVolumeMounts(makeGroup(), false);
      const mount = findMount(mounts, '/workspace/project');
      expect(mount).toBeUndefined();
    });

    it('includes group folder mount as read-write', () => {
      const mounts = buildVolumeMounts(makeGroup(), false);
      const mount = findMount(mounts, '/workspace/group');
      expect(mount).toBeDefined();
      expect(mount!.hostPath).toBe(path.resolve(GROUPS_DIR, 'test-group'));
      expect(mount!.readonly).toBe(false);
    });

    it('includes global mount as readonly when global dir exists', () => {
      const globalDir = path.join(GROUPS_DIR, 'global');
      existsOnlyAt(globalDir);

      const mounts = buildVolumeMounts(makeGroup(), false);
      const mount = findMount(mounts, '/workspace/global');
      expect(mount).toBeDefined();
      expect(mount!.hostPath).toBe(globalDir);
      expect(mount!.readonly).toBe(true);
    });

    it('does not include global mount when global dir does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const mounts = buildVolumeMounts(makeGroup(), false);
      const mount = findMount(mounts, '/workspace/global');
      expect(mount).toBeUndefined();
    });
  });

  // ---- Common mounts ----

  describe('common mounts (both main and non-main)', () => {
    it('includes sessions mount at /home/node/.claude (read-write) for main', () => {
      const mounts = buildVolumeMounts(makeGroup(), true);
      const mount = findMount(mounts, '/home/node/.claude');
      expect(mount).toBeDefined();
      expect(mount!.hostPath).toBe(
        path.join(DATA_DIR, 'sessions', 'test-group', '.claude'),
      );
      expect(mount!.readonly).toBe(false);
    });

    it('includes sessions mount at /home/node/.claude (read-write) for non-main', () => {
      const mounts = buildVolumeMounts(makeGroup(), false);
      const mount = findMount(mounts, '/home/node/.claude');
      expect(mount).toBeDefined();
      expect(mount!.hostPath).toBe(
        path.join(DATA_DIR, 'sessions', 'test-group', '.claude'),
      );
      expect(mount!.readonly).toBe(false);
    });

    it('includes IPC mount at /workspace/ipc (read-write) for main', () => {
      const mounts = buildVolumeMounts(makeGroup(), true);
      const mount = findMount(mounts, '/workspace/ipc');
      expect(mount).toBeDefined();
      expect(mount!.readonly).toBe(false);
    });

    it('includes IPC mount at /workspace/ipc (read-write) for non-main', () => {
      const mounts = buildVolumeMounts(makeGroup(), false);
      const mount = findMount(mounts, '/workspace/ipc');
      expect(mount).toBeDefined();
      expect(mount!.readonly).toBe(false);
    });

    it('includes event catalog mount when file exists', () => {
      const catalogPath = path.join(
        projectRoot,
        'config',
        'event-catalog.yaml',
      );
      existsOnlyAt(catalogPath);

      const mounts = buildVolumeMounts(makeGroup(), false);
      const mount = findMount(mounts, '/workspace/event-catalog.yaml');
      expect(mount).toBeDefined();
      expect(mount!.hostPath).toBe(catalogPath);
      expect(mount!.readonly).toBe(true);
    });

    it('does not include event catalog mount when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const mounts = buildVolumeMounts(makeGroup(), false);
      const mount = findMount(mounts, '/workspace/event-catalog.yaml');
      expect(mount).toBeUndefined();
    });

    it('includes hex skills mount when dir exists', () => {
      const skillsPath = path.resolve(
        process.env.HOME || '',
        'mrap-hex',
        '.claude',
        'skills',
      );
      existsOnlyAt(skillsPath);

      const mounts = buildVolumeMounts(makeGroup(), false);
      const mount = findMount(mounts, '/workspace/extra/skills');
      expect(mount).toBeDefined();
      expect(mount!.hostPath).toBe(skillsPath);
      expect(mount!.readonly).toBe(true);
    });

    it('does not include hex skills mount when dir does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const mounts = buildVolumeMounts(makeGroup(), false);
      const mount = findMount(mounts, '/workspace/extra/skills');
      expect(mount).toBeUndefined();
    });
  });

  // ---- Session setup ----

  describe('session setup', () => {
    it('creates settings.json on first run', () => {
      mockFs.existsSync.mockReturnValue(false);

      buildVolumeMounts(makeGroup(), false);

      const settingsPath = path.join(
        DATA_DIR,
        'sessions',
        'test-group',
        '.claude',
        'settings.json',
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        settingsPath,
        expect.stringContaining('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'),
      );
    });

    it('syncs skills from container/skills/ to session dir', () => {
      const skillsSrc = path.join(projectRoot, 'container', 'skills');
      existsOnlyAt(skillsSrc);
      mockFs.readdirSync.mockReturnValue([
        'skill-a',
        'skill-b',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      mockFs.statSync.mockReturnValue({
        isDirectory: () => true,
        mtimeMs: 0,
      } as unknown as ReturnType<typeof fs.statSync>);

      buildVolumeMounts(makeGroup(), false);

      expect(mockFs.cpSync).toHaveBeenCalledTimes(2);
      expect(mockFs.cpSync).toHaveBeenCalledWith(
        path.join(skillsSrc, 'skill-a'),
        expect.stringContaining('skill-a'),
        { recursive: true },
      );
      expect(mockFs.cpSync).toHaveBeenCalledWith(
        path.join(skillsSrc, 'skill-b'),
        expect.stringContaining('skill-b'),
        { recursive: true },
      );
    });
  });
});
