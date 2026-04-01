import { minimatch } from 'minimatch';

import type {
  Policy, ParsedEvent, Action,
} from './types.js';
import type { EventStore } from './event-store.js';
import { evaluateConditions } from './conditions.js';
import { executeEmit } from './actions/emit.js';
import { executeShell } from './actions/shell.js';
import { executeSchedule, type ScheduleDeps } from './actions/schedule.js';
import { executeMessage } from './actions/message.js';
import { parseDurationSeconds } from './duration.js';
import { logger } from '../logger.js';

export interface EngineDeps {
  sendMessage: (jid: string, text: string) => Promise<void>;
  scheduleDeps?: ScheduleDeps;
}

export class PolicyEngine {
  private fireTimestamps = new Map<string, number[]>();

  constructor(
    private store: EventStore,
    private deps: EngineDeps,
  ) {}

  processOnce(policies: Policy[]): void {
    const events = this.store.getUnprocessed(50);

    for (const rawEvent of events) {
      const event: ParsedEvent = {
        id: rawEvent.id,
        event_type: rawEvent.event_type,
        payload: JSON.parse(rawEvent.payload),
        source: rawEvent.source,
        created_at: rawEvent.created_at,
      };

      const matchedPolicies: string[] = [];

      for (const policy of policies) {
        if (!policy.enabled) continue;

        for (const rule of policy.rules) {
          // Trigger matching (glob)
          const triggerMatched = minimatch(event.event_type, rule.trigger.event);

          if (!triggerMatched) {
            this.store.logEval({
              event_id: event.id,
              policy_name: policy.name,
              rule_name: rule.name,
              trigger_matched: false,
              conditions_passed: null,
              condition_details: [],
              rate_limited: false,
              action_taken: false,
            });
            continue;
          }

          // Condition evaluation
          const { passed, details } = evaluateConditions(
            rule.conditions ?? [],
            event.payload,
            this.store,
          );

          if (!passed) {
            this.store.logEval({
              event_id: event.id,
              policy_name: policy.name,
              rule_name: rule.name,
              trigger_matched: true,
              conditions_passed: false,
              condition_details: details,
              rate_limited: false,
              action_taken: false,
            });
            continue;
          }

          // Rate limit check
          if (this.isRateLimited(policy)) {
            this.store.logEval({
              event_id: event.id,
              policy_name: policy.name,
              rule_name: rule.name,
              trigger_matched: true,
              conditions_passed: true,
              condition_details: details,
              rate_limited: true,
              action_taken: false,
            });
            continue;
          }

          // Execute actions
          matchedPolicies.push(policy.name);
          this.recordFire(policy.name);

          for (const action of rule.actions) {
            const start = Date.now();
            const result = this.executeAction(action, event.payload);
            const duration = Date.now() - start;

            this.store.logAction({
              event_id: event.id,
              policy_name: policy.name,
              rule_name: rule.name,
              action_type: action.type,
              action_detail: JSON.stringify(action),
              status: result.status,
              error_message: result.error ?? null,
              duration_ms: duration,
            });
          }

          this.store.logEval({
            event_id: event.id,
            policy_name: policy.name,
            rule_name: rule.name,
            trigger_matched: true,
            conditions_passed: true,
            condition_details: details,
            rate_limited: false,
            action_taken: true,
          });

          // Lifecycle handling
          if (policy.lifecycle === 'oneshot-disable') {
            policy.enabled = false;
          }
        }
      }

      this.store.markProcessed(event.id, matchedPolicies);
    }
  }

  processDeferredOnce(): void {
    const due = this.store.getDueDeferred();
    for (const deferred of due) {
      this.store.emit(
        deferred.event_type,
        JSON.parse(deferred.payload),
        deferred.source,
      );
      this.store.deleteDeferred(deferred.id);
    }
  }

  private executeAction(
    action: Action,
    payload: Record<string, unknown>,
  ): { status: 'success' | 'error'; error?: string } {
    switch (action.type) {
      case 'emit':
        return executeEmit(action, payload, this.store);
      case 'shell':
        return executeShell(action, payload);
      case 'schedule':
        if (!this.deps.scheduleDeps) {
          return { status: 'error', error: 'Schedule deps not configured' };
        }
        return executeSchedule(action, payload, this.deps.scheduleDeps);
      case 'message':
        // Fire and forget — wrap async in sync interface
        executeMessage(action, payload, { sendMessage: this.deps.sendMessage })
          .catch(err => logger.error({ err, action }, 'Message action failed'));
        return { status: 'success' };
      default:
        return { status: 'error', error: `Unknown action type: ${(action as Action).type}` };
    }
  }

  private isRateLimited(policy: Policy): boolean {
    if (!policy.rate_limit) return false;

    const windowSeconds = parseDurationSeconds(policy.rate_limit.window);
    const cutoff = Date.now() - windowSeconds * 1000;
    const timestamps = this.fireTimestamps.get(policy.name) ?? [];
    const recent = timestamps.filter(t => t >= cutoff);

    return recent.length >= policy.rate_limit.max_fires;
  }

  private recordFire(policyName: string): void {
    const timestamps = this.fireTimestamps.get(policyName) ?? [];
    timestamps.push(Date.now());
    // Keep only last 100 timestamps to avoid memory growth
    if (timestamps.length > 100) timestamps.splice(0, timestamps.length - 100);
    this.fireTimestamps.set(policyName, timestamps);
  }
}
