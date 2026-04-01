export interface Event {
  id: number;
  event_type: string;
  payload: string; // JSON string in DB, parsed when needed
  source: string;
  created_at: string;
  processed_at: string | null;
  dedup_key: string | null;
}

export interface ParsedEvent {
  id: number;
  event_type: string;
  payload: Record<string, unknown>;
  source: string;
  created_at: string;
}

export type ConditionOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'glob'
  | 'regex';

export interface FieldCondition {
  type?: undefined;
  field: string;
  op: ConditionOp;
  value: unknown;
}

export interface ShellCondition {
  type: 'shell';
  command: string;
}

export type Condition = FieldCondition | ShellCondition;

export interface ConditionDetail {
  field: string | null;
  op: string;
  expected: unknown;
  actual: unknown;
  passed: boolean | 'not_evaluated';
}

export interface EmitAction {
  type: 'emit';
  event: string;
  payload?: Record<string, unknown>;
  delay?: string; // e.g. "5m", "1h"
  cancel_group?: string;
}

export interface ShellAction {
  type: 'shell';
  command: string;
  timeout?: number;
}

export interface ScheduleAction {
  type: 'schedule';
  group: string;
  prompt: string;
  schedule_type: 'once' | 'cron' | 'interval';
  schedule_value: string;
}

export interface MessageAction {
  type: 'message';
  jid: string;
  text: string;
}

export type Action = EmitAction | ShellAction | ScheduleAction | MessageAction;

export interface Rule {
  name: string;
  trigger: {
    event: string; // supports glob patterns
  };
  conditions?: Condition[];
  actions: Action[];
}

export type PolicyLifecycle =
  | 'persistent'
  | 'oneshot-delete'
  | 'oneshot-disable';

export interface RateLimit {
  max_fires: number;
  window: string; // e.g. "1h", "10m"
}

export interface Policy {
  name: string;
  description?: string;
  lifecycle: PolicyLifecycle;
  enabled: boolean;
  rate_limit?: RateLimit;
  rules: Rule[];
  source?: string; // 'user' | 'llm' | 'system'
  source_group?: string; // which group created it (for LLM-created)
  fire_count?: number;
  max_fires?: number | null;
}

export interface PolicyEvalResult {
  event_id: number;
  policy_name: string;
  rule_name: string;
  trigger_matched: boolean;
  conditions_passed: boolean | null;
  condition_details: ConditionDetail[];
  rate_limited: boolean;
  action_taken: boolean;
}

export interface ActionResult {
  event_id: number;
  policy_name: string;
  rule_name: string;
  action_type: string;
  action_detail: string; // JSON
  status: 'success' | 'error' | 'rate_limited' | 'skipped';
  error_message: string | null;
  duration_ms: number;
}
