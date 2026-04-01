import { spawnSync } from 'child_process';
import { minimatch } from 'minimatch';

import type {
  Condition,
  ConditionDetail,
  FieldCondition,
  ShellCondition,
} from './types.js';
import type { EventStore } from './event-store.js';
import { renderTemplateShellSafe, resolveFieldPath } from './template.js';
import { parseDurationSeconds } from './duration.js';

const COUNT_RE = /^count\(([^,]+),\s*(\d+[smhd]?)\)$/;

export function evaluateConditions(
  conditions: Condition[],
  payload: Record<string, unknown>,
  store: EventStore,
): { passed: boolean; details: ConditionDetail[] } {
  if (conditions.length === 0) return { passed: true, details: [] };

  const details: ConditionDetail[] = [];

  for (let i = 0; i < conditions.length; i++) {
    const cond = conditions[i];
    const { actual, passed } = evaluateOne(cond, payload, store);

    if (cond.type === 'shell') {
      details.push({
        field: null,
        op: 'shell',
        expected: cond.command,
        actual,
        passed,
      });
    } else {
      details.push({
        field: cond.field,
        op: cond.op,
        expected: cond.value,
        actual,
        passed,
      });
    }

    if (!passed) {
      for (let j = i + 1; j < conditions.length; j++) {
        const rem = conditions[j];
        if (rem.type === 'shell') {
          details.push({
            field: null,
            op: 'shell',
            expected: rem.command,
            actual: null,
            passed: 'not_evaluated',
          });
        } else {
          details.push({
            field: rem.field,
            op: rem.op,
            expected: rem.value,
            actual: null,
            passed: 'not_evaluated',
          });
        }
      }
      return { passed: false, details };
    }
  }

  return { passed: true, details };
}

function evaluateOne(
  cond: Condition,
  payload: Record<string, unknown>,
  store: EventStore,
): { actual: unknown; passed: boolean } {
  if (cond.type === 'shell') {
    return evaluateShellCondition(cond, payload);
  }

  const fieldCond = cond as FieldCondition;
  const countMatch = COUNT_RE.exec(fieldCond.field);
  let actual: unknown;

  if (countMatch) {
    const eventType = countMatch[1];
    const durationStr = countMatch[2];
    const seconds = parseDurationSeconds(durationStr);
    actual = store.countEvents(eventType, seconds);
  } else {
    actual = resolveFieldPath(fieldCond.field, payload);
    if (actual === undefined) return { actual: undefined, passed: false };
  }

  const expected = fieldCond.value;
  let passed: boolean;

  switch (fieldCond.op) {
    case 'eq':
      passed = actual === expected;
      break;
    case 'neq':
      passed = actual !== expected;
      break;
    case 'gt':
      passed = (actual as number) > (expected as number);
      break;
    case 'gte':
      passed = (actual as number) >= (expected as number);
      break;
    case 'lt':
      passed = (actual as number) < (expected as number);
      break;
    case 'lte':
      passed = (actual as number) <= (expected as number);
      break;
    case 'contains':
      passed = String(actual).includes(String(expected));
      break;
    case 'glob':
      passed = minimatch(String(actual), String(expected));
      break;
    case 'regex': {
      try {
        const re = new RegExp(String(expected));
        passed = re.test(String(actual));
      } catch {
        passed = false;
      }
      break;
    }
    default:
      passed = false;
  }

  return { actual, passed };
}

function evaluateShellCondition(
  cond: ShellCondition,
  payload: Record<string, unknown>,
): { actual: unknown; passed: boolean } {
  let command = cond.command;
  if (command.includes('{{')) {
    command = renderTemplateShellSafe(command, { event: payload });
  }

  try {
    const result = spawnSync('sh', ['-c', command], {
      timeout: 30000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { actual: result.status, passed: result.status === 0 };
  } catch {
    return { actual: null, passed: false };
  }
}
