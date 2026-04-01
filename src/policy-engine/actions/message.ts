import type { MessageAction } from '../types.js';
import { renderTemplate } from '../template.js';

export interface MessageDeps {
  sendMessage: (jid: string, text: string) => Promise<void>;
}

export async function executeMessage(
  action: MessageAction,
  eventPayload: Record<string, unknown>,
  deps: MessageDeps,
): Promise<{ status: 'success' | 'error'; error?: string }> {
  const text = renderTemplate(action.text, { event: eventPayload });
  const jid = renderTemplate(action.jid, { event: eventPayload });

  try {
    await deps.sendMessage(jid, text);
    return { status: 'success' };
  } catch (err) {
    return { status: 'error', error: String(err) };
  }
}
