import type { ScheduleAction } from '../types.js';
import { renderTemplate } from '../template.js';

export interface ScheduleDeps {
  createTask: (task: {
    id: string;
    group_folder: string;
    chat_jid: string;
    prompt: string;
    schedule_type: string;
    schedule_value: string;
    context_mode: string;
    next_run: string | null;
    status: string;
    created_at: string;
  }) => void;
  findGroupJid: (groupFolder: string) => string | undefined;
}

export function executeSchedule(
  action: ScheduleAction,
  eventPayload: Record<string, unknown>,
  deps: ScheduleDeps,
): { status: 'success' | 'error'; error?: string; taskId?: string } {
  const prompt = renderTemplate(action.prompt, { event: eventPayload });
  const group = renderTemplate(action.group, { event: eventPayload });

  const jid = deps.findGroupJid(group);
  if (!jid) {
    return { status: 'error', error: `Group not found: ${group}` };
  }

  const taskId = `policy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  try {
    deps.createTask({
      id: taskId,
      group_folder: group,
      chat_jid: jid,
      prompt,
      schedule_type: action.schedule_type,
      schedule_value: action.schedule_value === 'now' ? now : action.schedule_value,
      context_mode: 'isolated',
      next_run: now,
      status: 'active',
      created_at: now,
    });
    return { status: 'success', taskId };
  } catch (err) {
    return { status: 'error', error: String(err) };
  }
}
