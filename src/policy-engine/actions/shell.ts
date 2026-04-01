import { spawnSync } from 'child_process';
import type { ShellAction } from '../types.js';
import { renderTemplateShellSafe } from '../template.js';

export function executeShell(
  action: ShellAction,
  eventPayload: Record<string, unknown>,
): { status: 'success' | 'error'; output?: string; error?: string } {
  const command = renderTemplateShellSafe(action.command, {
    event: eventPayload,
  });
  const timeout = (action.timeout ?? 30) * 1000;

  try {
    const result = spawnSync('sh', ['-c', command], {
      timeout,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.status === 0) {
      return { status: 'success', output: result.stdout?.trim() };
    } else {
      return {
        status: 'error',
        output: result.stdout?.trim(),
        error: result.stderr?.trim() || `Exit code: ${result.status}`,
      };
    }
  } catch (err) {
    return { status: 'error', error: String(err) };
  }
}
