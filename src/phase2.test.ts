import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Shared config reads ──────────────────────────────────────────────────

const groupsPath = path.join(ROOT, 'config', 'groups.json');
const groups = JSON.parse(fs.readFileSync(groupsPath, 'utf-8'));

const allowlistPath = path.join(ROOT, 'config', 'mount-allowlist.json');
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf-8'));

const policyDir = path.join(ROOT, 'config', 'policies');
const policyFiles = fs
  .readdirSync(policyDir)
  .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

type PolicyYaml = Record<string, unknown>;
type RuleYaml = Record<string, unknown>;

function loadPolicy(file: string): PolicyYaml {
  const content = fs.readFileSync(path.join(policyDir, file), 'utf-8');
  return yaml.load(content) as PolicyYaml;
}

function readGroupClaudeMd(name: string): string {
  return fs.readFileSync(
    path.join(ROOT, 'groups', name, 'CLAUDE.md'),
    'utf-8',
  );
}

// ─── 1. Config Structure Validation ────────────────────────────────────────

describe('Config Structure Validation', () => {
  it('has all 4 groups', () => {
    const names = Object.keys(groups.groups);
    expect(names).toContain('main');
    expect(names).toContain('ops');
    expect(names).toContain('gws');
    expect(names).toContain('boi');
  });

  it('each group has required fields', () => {
    for (const key of ['main', 'ops', 'gws', 'boi']) {
      const g = groups.groups[key];
      expect(g).toHaveProperty('name');
      expect(g).toHaveProperty('folder');
      expect(g).toHaveProperty('mcpServers');
      expect(g).toHaveProperty('additionalMounts');
    }
  });

  it('main group has 6 MCP servers', () => {
    const servers = Object.keys(groups.groups.main.mcpServers);
    expect(servers).toHaveLength(6);
    expect(servers).toEqual(
      expect.arrayContaining([
        'playwright',
        'github',
        'memory',
        'sequential-thinking',
        'context7',
        'exa',
      ]),
    );
  });

  it('ops has 2 MCP servers', () => {
    expect(Object.keys(groups.groups.ops.mcpServers)).toHaveLength(2);
  });

  it('gws has 0 MCP servers', () => {
    expect(Object.keys(groups.groups.gws.mcpServers)).toHaveLength(0);
  });

  it('boi has 2 MCP servers', () => {
    expect(Object.keys(groups.groups.boi.mcpServers)).toHaveLength(2);
  });

  it('MCP server entries have command and args with correct packages', () => {
    const mainServers = groups.groups.main.mcpServers;

    expect(mainServers.playwright.command).toBe('npx');
    expect(mainServers.playwright.args).toContain('@playwright/mcp');

    expect(mainServers.github.command).toBe('npx');
    expect(mainServers.github.args).toContain(
      '@modelcontextprotocol/server-github',
    );

    expect(mainServers.memory.command).toBe('npx');
    expect(mainServers.memory.args).toContain(
      '@modelcontextprotocol/server-memory',
    );

    expect(mainServers['sequential-thinking'].command).toBe('npx');
    expect(mainServers['sequential-thinking'].args).toContain(
      '@modelcontextprotocol/server-sequential-thinking',
    );

    expect(mainServers.context7.command).toBe('npx');
    expect(mainServers.context7.args).toContain('@upstash/context7-mcp');

    expect(mainServers.exa.command).toBe('npx');
    expect(mainServers.exa.args).toContain('exa-mcp-server');
  });
});

// ─── 2. Mount Allowlist Validation ─────────────────────────────────────────

describe('Mount Allowlist Validation', () => {
  it('has valid structure', () => {
    expect(allowlist).toHaveProperty('allowedRoots');
    expect(allowlist).toHaveProperty('blockedPatterns');
    expect(allowlist).toHaveProperty('nonMainReadOnly');
    expect(Array.isArray(allowlist.allowedRoots)).toBe(true);
    expect(Array.isArray(allowlist.blockedPatterns)).toBe(true);
  });

  it('nonMainReadOnly is false', () => {
    expect(allowlist.nonMainReadOnly).toBe(false);
  });

  it('contains expected root paths', () => {
    const paths = allowlist.allowedRoots.map(
      (r: { path: string }) => r.path,
    );
    expect(paths).toContain('~/mrap-hex');
    expect(paths).toContain('~/mrap-hex/.claude/skills');
    expect(paths).toContain('~/mrap-hex/.claude/scripts');
    expect(paths).toContain('~/.boi/queue');
    expect(paths).toContain('~/.boi/output');
    expect(paths).toContain('~/.hex-events');
    expect(paths).toContain('~/github.com/mrap');
  });

  it('blocked patterns include sensitive paths', () => {
    expect(allowlist.blockedPatterns).toContain('**/.env');
    expect(allowlist.blockedPatterns).toContain('**/.ssh');
    expect(allowlist.blockedPatterns).toContain('**/credentials*');
  });
});

// ─── 3. CLAUDE.md Templates ───────────────────────────────────────────────

describe('CLAUDE.md Templates', () => {
  const groupNames = ['main', 'ops', 'gws', 'boi'];

  it('all 4 groups have CLAUDE.md files', () => {
    for (const name of groupNames) {
      const p = path.join(ROOT, 'groups', name, 'CLAUDE.md');
      expect(fs.existsSync(p), `groups/${name}/CLAUDE.md exists`).toBe(true);
    }
  });

  it('main contains "You are not a chatbot"', () => {
    expect(readGroupClaudeMd('main')).toContain('You are not a chatbot');
  });

  it('ops contains "Autonomous System Operations"', () => {
    expect(readGroupClaudeMd('ops')).toContain(
      'Autonomous System Operations',
    );
  });

  it('gws contains "Google Workspace Agent"', () => {
    expect(readGroupClaudeMd('gws')).toContain('Google Workspace Agent');
  });

  it('boi contains "Build Orchestrator Agent"', () => {
    expect(readGroupClaudeMd('boi')).toContain('Build Orchestrator Agent');
  });

  it("ops CLAUDE.md mentions ability to modify main's CLAUDE.md", () => {
    expect(readGroupClaudeMd('ops')).toContain("main's CLAUDE.md");
  });

  it('boi CLAUDE.md mentions Docker socket access', () => {
    expect(readGroupClaudeMd('boi')).toContain('Docker socket access');
  });
});

// ─── 4. Policy YAML Structure ──────────────────────────────────────────────

describe('Policy YAML Structure', () => {
  it('all policy files parse as valid YAML', () => {
    for (const file of policyFiles) {
      expect(() => loadPolicy(file)).not.toThrow();
    }
  });

  it('each policy has name, lifecycle, enabled, rules array', () => {
    for (const file of policyFiles) {
      const policy = loadPolicy(file);
      expect(policy, `${file}`).toHaveProperty('name');
      expect(policy, `${file}`).toHaveProperty('lifecycle');
      expect(policy, `${file}`).toHaveProperty('enabled');
      expect(policy, `${file}`).toHaveProperty('rules');
      expect(Array.isArray(policy.rules), `${file} rules is array`).toBe(
        true,
      );
    }
  });

  it('each rule has name, trigger.event, actions array', () => {
    for (const file of policyFiles) {
      const policy = loadPolicy(file);
      const rules = policy.rules as RuleYaml[];
      for (const rule of rules) {
        expect(rule, `${file} rule`).toHaveProperty('name');
        expect(rule, `${file} rule`).toHaveProperty('trigger');
        const trigger = rule.trigger as Record<string, unknown>;
        expect(trigger, `${file} rule trigger`).toHaveProperty('event');
        expect(rule, `${file} rule`).toHaveProperty('actions');
        expect(
          Array.isArray(rule.actions),
          `${file} rule actions is array`,
        ).toBe(true);
      }
    }
  });

  it('boi-completion-notify triggers on boi.spec.completed and boi.spec.failed', () => {
    const policy = loadPolicy('boi-completion-notify.yaml');
    const rules = policy.rules as RuleYaml[];
    const triggerEvents = rules.map(
      (r) => (r.trigger as Record<string, unknown>).event,
    );
    expect(triggerEvents).toContain('boi.spec.completed');
    expect(triggerEvents).toContain('boi.spec.failed');
  });

  it('boi-dispatch-router triggers on boi.dispatch with schedule action type', () => {
    const policy = loadPolicy('boi-dispatch-router.yaml');
    const rules = policy.rules as RuleYaml[];
    const dispatchRule = rules.find(
      (r) => (r.trigger as Record<string, unknown>).event === 'boi.dispatch',
    );
    expect(dispatchRule).toBeDefined();
    const actions = dispatchRule!.actions as Array<Record<string, unknown>>;
    expect(actions.some((a) => a.type === 'schedule')).toBe(true);
  });

  it('boi-completion-notify payload includes status field', () => {
    const policy = loadPolicy('boi-completion-notify.yaml');
    const rules = policy.rules as RuleYaml[];
    for (const rule of rules) {
      const actions = rule.actions as Array<Record<string, unknown>>;
      const emitActions = actions.filter((a) => a.type === 'emit');
      for (const action of emitActions) {
        const payload = action.payload as Record<string, unknown>;
        expect(payload).toHaveProperty('status');
      }
    }
  });

  it('session-lifecycle triggers on system.started and system.shutdown', () => {
    const policy = loadPolicy('session-lifecycle.yaml');
    const rules = policy.rules as RuleYaml[];
    const triggerEvents = rules.map(
      (r) => (r.trigger as Record<string, unknown>).event,
    );
    expect(triggerEvents).toContain('system.started');
    expect(triggerEvents).toContain('system.shutdown');
  });
});

// ─── 5. getGroupMcpConfig (indirect via groups.json) ───────────────────────

describe('getGroupMcpConfig (indirect)', () => {
  it('returns correct MCP config for main group', () => {
    const mcpServers = groups.groups.main.mcpServers;
    expect(Object.keys(mcpServers)).toHaveLength(6);
    expect(mcpServers).toHaveProperty('playwright');
    expect(mcpServers).toHaveProperty('exa');
  });

  it('returns correct MCP config for ops group', () => {
    const mcpServers = groups.groups.ops.mcpServers;
    expect(Object.keys(mcpServers)).toHaveLength(2);
    expect(mcpServers).toHaveProperty('memory');
    expect(mcpServers).toHaveProperty('sequential-thinking');
  });

  it('returns empty object for gws group', () => {
    const mcpServers = groups.groups.gws.mcpServers;
    expect(Object.keys(mcpServers)).toHaveLength(0);
  });

  it('returns correct MCP config for boi group', () => {
    const mcpServers = groups.groups.boi.mcpServers;
    expect(Object.keys(mcpServers)).toHaveLength(2);
    expect(mcpServers).toHaveProperty('memory');
    expect(mcpServers).toHaveProperty('github');
  });

  it('returns empty object for unknown group', () => {
    expect(groups.groups['nonexistent']).toBeUndefined();
  });
});

// ─── 6. PolicyLoader with Phase 2 Policies ────────────────────────────────

describe('PolicyLoader with Phase 2 Policies', () => {
  it('policy names include expected Phase 2 policies', () => {
    const policyNames = policyFiles.map((f) => loadPolicy(f).name);
    expect(policyNames).toContain('boi-completion-notify');
    expect(policyNames).toContain('boi-dispatch-router');
    expect(policyNames).toContain('session-lifecycle');
    expect(policyNames).toContain('internal-lifecycle');
  });

  it('policies have correct trigger events', () => {
    const expectedTriggers: Record<string, string[]> = {
      'boi-completion-notify': ['boi.spec.completed', 'boi.spec.failed'],
      'boi-dispatch-router': ['boi.dispatch'],
      'session-lifecycle': ['system.started', 'system.shutdown'],
      'internal-lifecycle': ['system.*'],
    };

    for (const file of policyFiles) {
      const policy = loadPolicy(file);
      const name = policy.name as string;
      if (expectedTriggers[name]) {
        const rules = policy.rules as RuleYaml[];
        const triggerEvents = rules.map(
          (r) => (r.trigger as Record<string, unknown>).event as string,
        );
        for (const expected of expectedTriggers[name]) {
          expect(triggerEvents).toContain(expected);
        }
      }
    }
  });
});
