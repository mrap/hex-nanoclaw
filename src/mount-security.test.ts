import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// We'll set MOUNT_ALLOWLIST_PATH per-test via the mock
let mockAllowlistPath = '/tmp/nonexistent-allowlist.json';
vi.mock('./config.js', () => ({
  get MOUNT_ALLOWLIST_PATH() {
    return mockAllowlistPath;
  },
}));

import { logger } from './logger.js';
import { generateAllowlistTemplate } from './mount-security.js';

let tmpDir: string;

function allowlistPath(): string {
  return path.join(tmpDir, 'mount-allowlist.json');
}

function validAllowlist(overrides: Record<string, unknown> = {}) {
  return {
    allowedRoots: [
      {
        path: tmpDir,
        allowReadWrite: true,
        description: 'Test root',
      },
    ],
    blockedPatterns: [],
    nonMainReadOnly: false,
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-sec-test-'));
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function freshImport() {
  const mod = await import('./mount-security.js');
  return mod;
}

// ─── loadMountAllowlist ──────────────────────────────────────────────────────

describe('loadMountAllowlist', () => {
  it('returns null and warns when file is missing', async () => {
    mockAllowlistPath = path.join(tmpDir, 'does-not-exist.json');
    const { loadMountAllowlist: load } = await freshImport();

    const result = load();
    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns null and caches error for invalid JSON', async () => {
    const p = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(p, '{not valid json!!!');
    mockAllowlistPath = p;
    const { loadMountAllowlist: load } = await freshImport();

    const first = load();
    expect(first).toBeNull();
    expect(logger.error).toHaveBeenCalled();

    // Second call should also return null (cached error) without re-reading
    vi.clearAllMocks();
    const second = load();
    expect(second).toBeNull();
    // Should NOT log again — error is cached
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('throws during validation when allowedRoots is missing', async () => {
    const p = path.join(tmpDir, 'no-roots.json');
    fs.writeFileSync(
      p,
      JSON.stringify({ blockedPatterns: [], nonMainReadOnly: true }),
    );
    mockAllowlistPath = p;
    const { loadMountAllowlist: load } = await freshImport();

    const result = load();
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it('throws when allowedRoots is not an array', async () => {
    const p = path.join(tmpDir, 'bad-roots.json');
    fs.writeFileSync(
      p,
      JSON.stringify({
        allowedRoots: 'not-array',
        blockedPatterns: [],
        nonMainReadOnly: true,
      }),
    );
    mockAllowlistPath = p;
    const { loadMountAllowlist: load } = await freshImport();

    const result = load();
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it('returns valid allowlist with merged default blocked patterns', async () => {
    const p = allowlistPath();
    fs.writeFileSync(
      p,
      JSON.stringify({
        allowedRoots: [
          { path: tmpDir, allowReadWrite: true, description: 'test' },
        ],
        blockedPatterns: ['custom-secret'],
        nonMainReadOnly: false,
      }),
    );
    mockAllowlistPath = p;
    const { loadMountAllowlist: load } = await freshImport();

    const result = load();
    expect(result).not.toBeNull();
    expect(result!.blockedPatterns).toContain('.ssh');
    expect(result!.blockedPatterns).toContain('.env');
    expect(result!.blockedPatterns).toContain('custom-secret');
  });

  it('includes all DEFAULT_BLOCKED_PATTERNS even when blockedPatterns is empty', async () => {
    const p = allowlistPath();
    fs.writeFileSync(
      p,
      JSON.stringify({
        allowedRoots: [{ path: tmpDir, allowReadWrite: true }],
        blockedPatterns: [],
        nonMainReadOnly: true,
      }),
    );
    mockAllowlistPath = p;
    const { loadMountAllowlist: load } = await freshImport();

    const result = load();
    expect(result).not.toBeNull();
    // Check a sampling of defaults
    for (const pattern of [
      '.ssh',
      '.gnupg',
      '.aws',
      '.docker',
      'credentials',
      '.env',
      'id_rsa',
    ]) {
      expect(result!.blockedPatterns).toContain(pattern);
    }
  });

  it('returns cached result on second call', async () => {
    const p = allowlistPath();
    fs.writeFileSync(
      p,
      JSON.stringify({
        allowedRoots: [{ path: tmpDir, allowReadWrite: true }],
        blockedPatterns: [],
        nonMainReadOnly: false,
      }),
    );
    mockAllowlistPath = p;
    const { loadMountAllowlist: load } = await freshImport();

    const first = load();
    const second = load();
    expect(first).toBe(second); // Same object reference — cached
  });
});

// ─── isValidContainerPath (tested via validateMount) ─────────────────────────

describe('container path validation (via validateMount)', () => {
  // Set up a valid allowlist so we can isolate container path checks
  async function setup() {
    const hostDir = path.join(tmpDir, 'project');
    fs.mkdirSync(hostDir, { recursive: true });
    const p = allowlistPath();
    fs.writeFileSync(
      p,
      JSON.stringify({
        allowedRoots: [{ path: tmpDir, allowReadWrite: true }],
        blockedPatterns: [],
        nonMainReadOnly: false,
      }),
    );
    mockAllowlistPath = p;
    const { validateMount: vm } = await freshImport();
    return { vm, hostDir };
  }

  it('blocks container path with ".."', async () => {
    const { vm, hostDir } = await setup();
    const result = vm({ hostPath: hostDir, containerPath: '../escape' }, true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('..');
  });

  it('blocks absolute container path', async () => {
    const { vm, hostDir } = await setup();
    const result = vm({ hostPath: hostDir, containerPath: '/etc' }, true);
    expect(result.allowed).toBe(false);
  });

  it('blocks whitespace-only container path', async () => {
    const { vm, hostDir } = await setup();
    // Empty string '' is falsy, so it falls through to basename default.
    // A whitespace-only string is truthy but should be caught by trim() check.
    const result = vm({ hostPath: hostDir, containerPath: '   ' }, true);
    expect(result.allowed).toBe(false);
  });

  it('blocks container path with colon (Docker syntax injection)', async () => {
    const { vm, hostDir } = await setup();
    const result = vm({ hostPath: hostDir, containerPath: 'repo:rw' }, true);
    expect(result.allowed).toBe(false);
  });

  it('allows valid relative container path', async () => {
    const { vm, hostDir } = await setup();
    const result = vm({ hostPath: hostDir, containerPath: 'my-data' }, true);
    expect(result.allowed).toBe(true);
    expect(result.resolvedContainerPath).toBe('my-data');
  });
});

// ─── matchesBlockedPattern (tested via validateMount) ────────────────────────

describe('blocked pattern matching (via validateMount)', () => {
  async function setup(extraPatterns: string[] = []) {
    const hostDir = path.join(tmpDir, 'safe-project');
    fs.mkdirSync(hostDir, { recursive: true });
    const p = allowlistPath();
    fs.writeFileSync(
      p,
      JSON.stringify({
        allowedRoots: [{ path: tmpDir, allowReadWrite: true }],
        blockedPatterns: extraPatterns,
        nonMainReadOnly: false,
      }),
    );
    mockAllowlistPath = p;
    const { validateMount: vm } = await freshImport();
    return { vm, hostDir };
  }

  it('blocks path containing .ssh component', async () => {
    const { vm } = await setup();
    const sshDir = path.join(tmpDir, '.ssh');
    fs.mkdirSync(sshDir, { recursive: true });
    const result = vm({ hostPath: sshDir }, true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('.ssh');
  });

  it('blocks path containing .env component', async () => {
    const { vm } = await setup();
    const envDir = path.join(tmpDir, '.env');
    fs.mkdirSync(envDir, { recursive: true });
    const result = vm({ hostPath: envDir }, true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('.env');
  });

  it('blocks path containing credentials in full path', async () => {
    const { vm } = await setup();
    const credDir = path.join(tmpDir, 'credentials');
    fs.mkdirSync(credDir, { recursive: true });
    const result = vm({ hostPath: credDir }, true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('credentials');
  });

  it('allows clean path with no blocked patterns', async () => {
    const { vm, hostDir } = await setup();
    const result = vm({ hostPath: hostDir }, true);
    expect(result.allowed).toBe(true);
  });
});

// ─── validateMount full pipeline ─────────────────────────────────────────────

describe('validateMount', () => {
  it('blocks all mounts when no allowlist file exists', async () => {
    mockAllowlistPath = path.join(tmpDir, 'no-such-file.json');
    const { validateMount: vm } = await freshImport();

    const result = vm({ hostPath: '/tmp' }, true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('No mount allowlist configured');
  });

  it('blocks mount when host path does not exist', async () => {
    const p = allowlistPath();
    fs.writeFileSync(p, JSON.stringify(validAllowlist()));
    mockAllowlistPath = p;
    const { validateMount: vm } = await freshImport();

    const result = vm({ hostPath: path.join(tmpDir, 'nonexistent-dir') }, true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('does not exist');
  });

  it('allows host path under an allowed root', async () => {
    const subDir = path.join(tmpDir, 'myproject');
    fs.mkdirSync(subDir);
    const p = allowlistPath();
    fs.writeFileSync(p, JSON.stringify(validAllowlist()));
    mockAllowlistPath = p;
    const { validateMount: vm } = await freshImport();

    const result = vm({ hostPath: subDir, containerPath: 'myproject' }, true);
    expect(result.allowed).toBe(true);
    expect(result.realHostPath).toBe(fs.realpathSync(subDir));
  });

  it('blocks host path not under any allowed root', async () => {
    // Create a directory outside tmpDir
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
    try {
      const p = allowlistPath();
      fs.writeFileSync(p, JSON.stringify(validAllowlist()));
      mockAllowlistPath = p;
      const { validateMount: vm } = await freshImport();

      const result = vm({ hostPath: outsideDir, containerPath: 'data' }, true);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not under any allowed root');
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('forces readonly for non-main group when nonMainReadOnly is true', async () => {
    const subDir = path.join(tmpDir, 'proj');
    fs.mkdirSync(subDir);
    const p = allowlistPath();
    fs.writeFileSync(
      p,
      JSON.stringify(validAllowlist({ nonMainReadOnly: true })),
    );
    mockAllowlistPath = p;
    const { validateMount: vm } = await freshImport();

    const result = vm(
      { hostPath: subDir, containerPath: 'proj', readonly: false },
      false,
    );
    expect(result.allowed).toBe(true);
    expect(result.effectiveReadonly).toBe(true);
  });

  it('allows read-write for main group when root allows it', async () => {
    const subDir = path.join(tmpDir, 'proj');
    fs.mkdirSync(subDir);
    const p = allowlistPath();
    fs.writeFileSync(p, JSON.stringify(validAllowlist()));
    mockAllowlistPath = p;
    const { validateMount: vm } = await freshImport();

    const result = vm(
      { hostPath: subDir, containerPath: 'proj', readonly: false },
      true,
    );
    expect(result.allowed).toBe(true);
    expect(result.effectiveReadonly).toBe(false);
  });

  it('forces readonly for main group when root forbids read-write', async () => {
    const subDir = path.join(tmpDir, 'proj');
    fs.mkdirSync(subDir);
    const p = allowlistPath();
    fs.writeFileSync(
      p,
      JSON.stringify(
        validAllowlist({
          allowedRoots: [
            { path: tmpDir, allowReadWrite: false, description: 'ro root' },
          ],
        }),
      ),
    );
    mockAllowlistPath = p;
    const { validateMount: vm } = await freshImport();

    const result = vm(
      { hostPath: subDir, containerPath: 'proj', readonly: false },
      true,
    );
    expect(result.allowed).toBe(true);
    expect(result.effectiveReadonly).toBe(true);
  });

  it('defaults containerPath to basename of hostPath when not provided', async () => {
    const subDir = path.join(tmpDir, 'my-special-dir');
    fs.mkdirSync(subDir);
    const p = allowlistPath();
    fs.writeFileSync(p, JSON.stringify(validAllowlist()));
    mockAllowlistPath = p;
    const { validateMount: vm } = await freshImport();

    const result = vm({ hostPath: subDir }, true);
    expect(result.allowed).toBe(true);
    expect(result.resolvedContainerPath).toBe('my-special-dir');
  });
});

// ─── validateAdditionalMounts (batch) ────────────────────────────────────────

describe('validateAdditionalMounts', () => {
  it('returns only valid mounts and logs warnings for rejected ones', async () => {
    const goodDir = path.join(tmpDir, 'good');
    fs.mkdirSync(goodDir);
    const sshDir = path.join(tmpDir, '.ssh');
    fs.mkdirSync(sshDir);

    const p = allowlistPath();
    fs.writeFileSync(p, JSON.stringify(validAllowlist()));
    mockAllowlistPath = p;
    const { validateAdditionalMounts: vam } = await freshImport();

    const results = vam(
      [
        { hostPath: goodDir, containerPath: 'good' },
        { hostPath: sshDir, containerPath: 'ssh-stuff' }, // blocked pattern
        { hostPath: path.join(tmpDir, 'nonexistent'), containerPath: 'nope' }, // doesn't exist
      ],
      'test-group',
      true,
    );

    expect(results).toHaveLength(1);
    expect(results[0].hostPath).toBe(fs.realpathSync(goodDir));
    expect(results[0].containerPath).toBe('/workspace/extra/good');
    expect(results[0].readonly).toBe(true); // default readonly
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});

// ─── generateAllowlistTemplate ───────────────────────────────────────────────

describe('generateAllowlistTemplate', () => {
  it('returns valid JSON with expected structure', () => {
    const template = generateAllowlistTemplate();
    const parsed = JSON.parse(template);
    expect(Array.isArray(parsed.allowedRoots)).toBe(true);
    expect(Array.isArray(parsed.blockedPatterns)).toBe(true);
    expect(typeof parsed.nonMainReadOnly).toBe('boolean');
    expect(parsed.allowedRoots.length).toBeGreaterThan(0);
  });
});
