import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

import type {
  Policy,
  Rule,
  Condition,
  Action,
  PolicyLifecycle,
  ConditionOp,
} from './types.js';
import type { EventStore } from './event-store.js';
import { logger } from '../logger.js';

export class PolicyLoader {
  private fileMtimes = new Map<string, number>();
  private cachedPolicies = new Map<string, Policy[]>();

  constructor(
    private policyDir: string,
    private store: EventStore,
  ) {}

  loadAll(): Policy[] {
    const fromFiles = this.loadFromFiles();
    const fromDb = this.loadFromDb();
    return [...fromFiles, ...fromDb];
  }

  private loadFromFiles(): Policy[] {
    if (!fs.existsSync(this.policyDir)) return [];

    const policies: Policy[] = [];
    const files = fs
      .readdirSync(this.policyDir)
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of files) {
      const filePath = path.join(this.policyDir, file);
      try {
        const stat = fs.statSync(filePath);
        const cachedMtime = this.fileMtimes.get(filePath);

        if (cachedMtime === stat.mtimeMs && this.cachedPolicies.has(filePath)) {
          policies.push(...this.cachedPolicies.get(filePath)!);
          continue;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const raw = yaml.load(content) as Record<string, unknown>;
        if (!raw || typeof raw !== 'object') continue;

        const policy = this.parsePolicy(raw, 'file');
        if (!policy.enabled) continue;

        this.validatePolicyRegexes(policy, filePath);

        this.fileMtimes.set(filePath, stat.mtimeMs);
        this.cachedPolicies.set(filePath, [policy]);
        policies.push(policy);
      } catch {
        // Skip invalid files
      }
    }

    return policies;
  }

  private loadFromDb(): Policy[] {
    const rows = this.store.getEnabledPolicies();

    const policies: Policy[] = [];
    for (const row of rows) {
      try {
        const raw = yaml.load(row.yaml_content) as Record<string, unknown>;
        if (!raw || typeof raw !== 'object') continue;

        const policy = this.parsePolicy(raw, row.source);
        policy.source_group = row.source_group ?? undefined;
        policy.fire_count = row.fire_count;
        policy.max_fires = row.max_fires;

        this.validatePolicyRegexes(policy, `db:${row.name}`);

        policies.push(policy);
      } catch {
        // Skip invalid DB entries
      }
    }

    return policies;
  }

  private validatePolicyRegexes(policy: Policy, source: string): void {
    for (const rule of policy.rules) {
      if (!rule.conditions) continue;
      for (const cond of rule.conditions) {
        if ('op' in cond && cond.op === 'regex') {
          try {
            new RegExp(String(cond.value));
          } catch {
            logger.warn(
              { policy: policy.name, rule: rule.name, pattern: cond.value, source },
              'Invalid regex in policy condition — will always fail',
            );
          }
        }
      }
    }
  }

  private parsePolicy(raw: Record<string, unknown>, source: string): Policy {
    const rules = ((raw.rules as Array<Record<string, unknown>>) || []).map(
      (r): Rule => ({
        name: String(r.name || 'unnamed'),
        trigger: {
          event: String((r.trigger as Record<string, unknown>)?.event || '*'),
        },
        conditions: this.parseConditions(
          r.conditions as Array<Record<string, unknown>> | undefined,
        ),
        actions: this.parseActions(
          (r.actions as Array<Record<string, unknown>>) || [],
        ),
      }),
    );

    return {
      name: String(raw.name || 'unnamed'),
      description: raw.description ? String(raw.description) : undefined,
      lifecycle: (raw.lifecycle as PolicyLifecycle) || 'persistent',
      enabled: raw.enabled !== false,
      rate_limit: raw.rate_limit
        ? {
            max_fires: (raw.rate_limit as Record<string, unknown>)
              .max_fires as number,
            window: String((raw.rate_limit as Record<string, unknown>).window),
          }
        : undefined,
      rules,
      source,
    };
  }

  private parseConditions(
    raw: Array<Record<string, unknown>> | undefined,
  ): Condition[] {
    if (!raw) return [];
    return raw.map((c) => {
      if (c.type === 'shell') {
        return { type: 'shell' as const, command: String(c.command) };
      }
      return {
        field: String(c.field),
        op: String(c.op) as ConditionOp,
        value: c.value,
      };
    }) as Condition[];
  }

  private parseActions(raw: Array<Record<string, unknown>>): Action[] {
    return raw
      .map((a): Action | null => {
        switch (a.type) {
          case 'emit':
            return {
              type: 'emit',
              event: String(a.event),
              payload: a.payload as Record<string, unknown> | undefined,
              delay: a.delay ? String(a.delay) : undefined,
              cancel_group: a.cancel_group ? String(a.cancel_group) : undefined,
            };
          case 'shell':
            return {
              type: 'shell',
              command: String(a.command),
              timeout: a.timeout ? Number(a.timeout) : undefined,
            };
          case 'schedule':
            return {
              type: 'schedule',
              group: String(a.group),
              prompt: String(a.prompt),
              schedule_type:
                (a.schedule_type as 'once' | 'cron' | 'interval') || 'once',
              schedule_value: String(a.schedule_value || 'now'),
            };
          case 'message':
            return {
              type: 'message',
              jid: String(a.jid),
              text: String(a.text),
            };
          default:
            logger.warn({ action_type: a.type }, 'Unknown action type in policy — skipping');
            return null;
        }
      })
      .filter((a): a is Action => a !== null);
  }
}
