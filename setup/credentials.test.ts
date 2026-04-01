import { describe, it, expect } from 'vitest';

/**
 * Tests for the credentials setup step.
 *
 * Uses inline logic mirrors (same approach as service.test.ts and environment.test.ts)
 * to verify gateway detection, CLI resolution, key registration, and status output.
 */

type CommandMapping = Record<string, { result?: string; throws?: boolean }>;

function mockExecSync(command: string, mapping: CommandMapping): string {
  for (const [pattern, behavior] of Object.entries(mapping)) {
    if (command.includes(pattern)) {
      if (behavior.throws) throw new Error(`Command failed: ${pattern}`);
      return behavior.result ?? '';
    }
  }
  throw new Error(`Unmocked command: ${command}`);
}

function isHealthy(mapping: CommandMapping): boolean {
  try {
    mockExecSync('curl -sf http://127.0.0.1:10254/health', mapping);
    return true;
  } catch {
    return false;
  }
}

function findCli(mapping: CommandMapping): string | null {
  try {
    mockExecSync('~/.local/bin/onecli version', mapping);
    return '~/.local/bin/onecli';
  } catch {
    // not at explicit path
  }
  try {
    const resolved = mockExecSync('command -v onecli', mapping);
    if (resolved) return resolved;
  } catch {
    // not in PATH
  }
  return null;
}

function parseEnvKey(content: string, key: string): string | undefined {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const k = trimmed.slice(0, eqIdx).trim();
    if (k !== key) continue;
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (value) return value;
  }
  return undefined;
}

function computeStatus(
  gatewayRunning: boolean,
  cliInstalled: boolean,
  anthropicRegistered: boolean,
): string {
  return gatewayRunning && cliInstalled && anthropicRegistered
    ? 'success'
    : gatewayRunning && cliInstalled
      ? 'partial'
      : 'failed';
}

describe('gateway health check', () => {
  it('detects healthy gateway via curl', () => {
    expect(
      isHealthy({
        'curl -sf http://127.0.0.1:10254/health': { result: 'OK' },
      }),
    ).toBe(true);
  });

  it('detects unhealthy gateway', () => {
    expect(
      isHealthy({
        'curl -sf http://127.0.0.1:10254/health': { throws: true },
      }),
    ).toBe(false);
  });
});

describe('CLI detection', () => {
  it('finds CLI at explicit path', () => {
    expect(
      findCli({
        '~/.local/bin/onecli version': { result: 'onecli v1.0.0' },
      }),
    ).toBe('~/.local/bin/onecli');
  });

  it('finds CLI via PATH when not at explicit path', () => {
    expect(
      findCli({
        '~/.local/bin/onecli version': { throws: true },
        'command -v onecli': { result: '/usr/local/bin/onecli' },
      }),
    ).toBe('/usr/local/bin/onecli');
  });

  it('returns null when CLI not found', () => {
    expect(
      findCli({
        '~/.local/bin/onecli version': { throws: true },
        'command -v onecli': { throws: true },
      }),
    ).toBeNull();
  });
});

describe('API key reading', () => {
  it('extracts ANTHROPIC_API_KEY from env content', () => {
    const content =
      'TELEGRAM_BOT_TOKEN=abc\nANTHROPIC_API_KEY=sk-ant-test-123\nASSISTANT_NAME=hex';
    expect(parseEnvKey(content, 'ANTHROPIC_API_KEY')).toBe('sk-ant-test-123');
  });

  it('returns undefined when key is missing', () => {
    const content = 'TELEGRAM_BOT_TOKEN=abc\nASSISTANT_NAME=hex';
    expect(parseEnvKey(content, 'ANTHROPIC_API_KEY')).toBeUndefined();
  });
});

describe('status output', () => {
  it('reports success when all phases pass', () => {
    expect(computeStatus(true, true, true)).toBe('success');
  });

  it('reports partial when gateway and CLI ok but no key registered', () => {
    expect(computeStatus(true, true, false)).toBe('partial');
  });

  it('reports failed when gateway is down', () => {
    expect(computeStatus(false, true, false)).toBe('failed');
  });

  it('reports failed when CLI is not installed', () => {
    expect(computeStatus(true, false, false)).toBe('failed');
  });
});

describe('Docker detection for gateway install', () => {
  it('detects running Docker', () => {
    let dockerRunning = false;
    try {
      mockExecSync('docker info', {
        'docker info': { result: 'docker info output' },
      });
      dockerRunning = true;
    } catch {
      dockerRunning = false;
    }
    expect(dockerRunning).toBe(true);
  });

  it('detects Docker not running', () => {
    let dockerRunning = false;
    try {
      mockExecSync('docker info', { 'docker info': { throws: true } });
      dockerRunning = true;
    } catch {
      dockerRunning = false;
    }
    expect(dockerRunning).toBe(false);
  });
});

describe('secrets create command construction', () => {
  it('builds correct onecli secrets create command', () => {
    const cliPath = '/home/user/.local/bin/onecli';
    const apiKey = 'sk-ant-test-key-123';
    const cmd = `${cliPath} secrets create --name Anthropic --type anthropic --value ${apiKey} --host-pattern api.anthropic.com`;

    expect(cmd).toContain('secrets create');
    expect(cmd).toContain('--name Anthropic');
    expect(cmd).toContain('--type anthropic');
    expect(cmd).toContain(`--value ${apiKey}`);
    expect(cmd).toContain('--host-pattern api.anthropic.com');
    expect(cmd.startsWith(cliPath)).toBe(true);
  });
});
