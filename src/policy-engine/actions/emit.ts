import type { EmitAction } from '../types.js';
import type { EventStore } from '../event-store.js';
import { renderTemplate } from '../template.js';
import { parseDurationMs } from '../duration.js';

export function executeEmit(
  action: EmitAction,
  eventPayload: Record<string, unknown>,
  store: EventStore,
): { status: 'success' | 'error'; error?: string } {
  try {
    // Render template in event name
    const eventType = renderTemplate(action.event, { event: eventPayload });

    // Render templates in payload values
    const payload = action.payload ?? {};
    const rendered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      rendered[k] = typeof v === 'string'
        ? renderTemplate(v, { event: eventPayload })
        : v;
    }

    if (action.delay) {
      // Deferred emit
      if (action.cancel_group) {
        store.cancelDeferred(action.cancel_group);
      }
      const delayMs = parseDurationMs(action.delay);
      const fireAt = new Date(Date.now() + delayMs).toISOString();
      store.addDeferred(eventType, rendered, 'policy', fireAt, action.cancel_group);
    } else {
      store.emit(eventType, rendered, 'policy');
    }

    return { status: 'success' };
  } catch (err) {
    return { status: 'error', error: String(err) };
  }
}
