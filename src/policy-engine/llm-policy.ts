import yaml from 'js-yaml';
import type { ConditionOp, PolicyLifecycle } from './types.js';

// These must stay in sync with the Action union type in types.ts
const VALID_ACTION_TYPES = ['emit', 'shell', 'schedule', 'message'] as const;
const VALID_CONDITION_OPS: ConditionOp[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'glob',
  'regex',
];
const VALID_LIFECYCLES: PolicyLifecycle[] = [
  'persistent',
  'oneshot-delete',
  'oneshot-disable',
];

/**
 * Validates policy YAML content. Returns an array of error strings (empty = valid).
 */
export function validatePolicyYaml(yamlContent: string): string[] {
  const errors: string[] = [];

  let doc: unknown;
  try {
    doc = yaml.load(yamlContent);
  } catch (e) {
    errors.push(
      `YAML parse error: ${e instanceof Error ? e.message : String(e)}`,
    );
    return errors;
  }

  if (doc == null || typeof doc !== 'object') {
    errors.push('Policy must be a YAML object');
    return errors;
  }

  const policy = doc as Record<string, unknown>;

  // name
  if (!policy.name || typeof policy.name !== 'string') {
    errors.push('Policy must have a "name" field (string)');
  }

  // lifecycle
  if (
    policy.lifecycle !== undefined &&
    !VALID_LIFECYCLES.includes(policy.lifecycle as PolicyLifecycle)
  ) {
    errors.push(
      `Invalid lifecycle "${String(policy.lifecycle)}". Valid: ${VALID_LIFECYCLES.join(', ')}`,
    );
  }

  // rules
  if (!Array.isArray(policy.rules) || policy.rules.length === 0) {
    errors.push('Policy must have a non-empty "rules" array');
    return errors;
  }

  for (let i = 0; i < policy.rules.length; i++) {
    const rule = policy.rules[i] as Record<string, unknown>;
    const prefix = `rules[${i}]`;

    // rule name
    if (!rule.name || typeof rule.name !== 'string') {
      errors.push(`${prefix}: rule must have a "name" field (string)`);
    }

    // trigger
    if (!rule.trigger || typeof rule.trigger !== 'object') {
      errors.push(`${prefix}: must have a "trigger" object`);
    } else {
      const trigger = rule.trigger as Record<string, unknown>;
      if (!trigger.event || typeof trigger.event !== 'string') {
        errors.push(`${prefix}.trigger: must have an "event" field (string)`);
      }
    }

    // actions
    if (!Array.isArray(rule.actions) || rule.actions.length === 0) {
      errors.push(`${prefix}: must have at least one action`);
    } else {
      for (let j = 0; j < rule.actions.length; j++) {
        const action = rule.actions[j] as Record<string, unknown>;
        if (
          !action.type ||
          !VALID_ACTION_TYPES.includes(
            action.type as (typeof VALID_ACTION_TYPES)[number],
          )
        ) {
          errors.push(
            `${prefix}.actions[${j}]: invalid type "${String(action.type)}". Valid: ${VALID_ACTION_TYPES.join(', ')}`,
          );
          continue;
        }

        // Validate required fields per action type
        switch (action.type) {
          case 'emit':
            if (!action.event)
              errors.push(
                `${prefix}.actions[${j}]: emit action requires "event" field`,
              );
            break;
          case 'shell':
            if (!action.command)
              errors.push(
                `${prefix}.actions[${j}]: shell action requires "command" field`,
              );
            break;
          case 'schedule':
            if (!action.group)
              errors.push(
                `${prefix}.actions[${j}]: schedule action requires "group" field`,
              );
            if (!action.prompt)
              errors.push(
                `${prefix}.actions[${j}]: schedule action requires "prompt" field`,
              );
            break;
          case 'message':
            if (!action.jid)
              errors.push(
                `${prefix}.actions[${j}]: message action requires "jid" field`,
              );
            if (!action.text)
              errors.push(
                `${prefix}.actions[${j}]: message action requires "text" field`,
              );
            break;
        }
      }
    }

    // conditions (optional)
    if (rule.conditions !== undefined) {
      if (!Array.isArray(rule.conditions)) {
        errors.push(`${prefix}: "conditions" must be an array`);
      } else {
        for (let j = 0; j < rule.conditions.length; j++) {
          const cond = rule.conditions[j] as Record<string, unknown>;
          if (cond.type === 'shell') continue; // shell conditions don't use op
          if (
            cond.op &&
            !VALID_CONDITION_OPS.includes(cond.op as ConditionOp)
          ) {
            errors.push(
              `${prefix}.conditions[${j}]: invalid op "${String(cond.op)}". Valid: ${VALID_CONDITION_OPS.join(', ')}`,
            );
          }
        }
      }
    }
  }

  return errors;
}

/**
 * Builds a system prompt for Claude to generate policy YAML from a natural language request.
 * Does NOT call the Claude API — returns the prompt string for the integration layer.
 */
export function buildPolicyPrompt(
  userRequest: string,
  eventCatalog?: string,
): string {
  const catalogSection = eventCatalog
    ? `\n## Available Events\n${eventCatalog}\n`
    : '';

  return `You are a policy generator for the NanoClaw policy engine, an event-driven automation system.
Given a user request, generate valid policy YAML.

## Policy Schema

\`\`\`yaml
name: <string>              # required, unique policy name
description: <string>       # optional
lifecycle: <lifecycle>       # persistent | oneshot-delete | oneshot-disable
enabled: true               # boolean
rate_limit:                  # optional
  max_fires: <number>
  window: <duration>        # e.g. "1h", "10m"
rules:
  - name: <string>
    trigger:
      event: <string>       # event type, supports glob patterns (e.g. "boi.*")
    conditions:              # optional, all must pass
      - field: <dotpath>     # dot-notation path into event payload
        op: <operator>
        value: <any>
    actions:
      - type: <action_type>
        # action-specific fields (see below)
\`\`\`

## Action Types

- **emit** — Emit a new event: \`{ type: "emit", event: "event.name", payload: {...}, delay: "5m", cancel_group: "group" }\`
- **shell** — Run a shell command: \`{ type: "shell", command: "...", timeout: 30000 }\`
- **schedule** — Schedule a task: \`{ type: "schedule", group: "...", prompt: "...", schedule_type: "once"|"cron"|"interval", schedule_value: "..." }\`
- **message** — Send a message: \`{ type: "message", jid: "...", text: "..." }\`

## Condition Operators

| Op | Meaning |
|----|---------|
| eq | Equal |
| neq | Not equal |
| gt | Greater than |
| gte | Greater than or equal |
| lt | Less than |
| lte | Less than or equal |
| contains | String/array contains |
| glob | Glob pattern match |
| regex | Regular expression match |

Shell conditions: \`{ type: "shell", command: "..." }\` — passes if exit code is 0.

## Lifecycle Modes

- **persistent** — Policy stays active indefinitely.
- **oneshot-delete** — Policy is deleted after first fire.
- **oneshot-disable** — Policy is disabled (not deleted) after first fire.

## count() Function

In condition values, you can use \`count(event_type, window)\` to reference the number of matching events in a time window. Example: \`{ field: "count(boi.spec.failed, 1h)", op: "gte", value: 3 }\` fires when 3+ failures occur in the last hour.
${catalogSection}
## Examples

### Example 1: Alert on BOI failure
\`\`\`yaml
name: boi-failure-alert
description: Alert when a BOI spec fails
lifecycle: persistent
enabled: true
rules:
  - name: on-failure
    trigger:
      event: boi.spec.failed
    actions:
      - type: message
        jid: default
        text: "BOI spec {{payload.spec_id}} failed: {{payload.error}}"
\`\`\`

### Example 2: Chain events with delay
\`\`\`yaml
name: deploy-cooldown
description: Wait 5 minutes after deploy, then run health check
lifecycle: persistent
enabled: true
rules:
  - name: post-deploy
    trigger:
      event: deploy.completed
    actions:
      - type: emit
        event: health.check.requested
        delay: "5m"
\`\`\`

### Example 3: One-shot notification
\`\`\`yaml
name: first-login-welcome
description: Send welcome message on first login, then self-delete
lifecycle: oneshot-delete
enabled: true
rules:
  - name: welcome
    trigger:
      event: user.login
    actions:
      - type: message
        jid: default
        text: "Welcome! Your account is set up."
\`\`\`

## User Request

${userRequest}

## Instructions

Generate a single valid policy YAML block that fulfills the user request. Output ONLY valid YAML. No explanation, no markdown fences, no commentary. Use descriptive names. Include a description field.`;
}
