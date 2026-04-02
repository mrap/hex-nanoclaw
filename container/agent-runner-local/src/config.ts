/**
 * Configuration for the local model agent runner.
 * Reads from environment variables with sensible defaults.
 */

export const LOCAL_MODEL_URL =
  process.env.LOCAL_MODEL_URL || 'http://localhost:11434';
export const MODEL_NAME = process.env.MODEL_NAME || 'qwen2.5:32b';
export const GROUP_NAME = process.env.GROUP_NAME || '';

// Sentinel markers for robust output parsing (must match container-runner.ts)
export const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
export const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

// IPC paths (same as agent-runner)
export const IPC_DIR = '/workspace/ipc';
export const IPC_INPUT_DIR = `${IPC_DIR}/input`;
export const IPC_INPUT_CLOSE_SENTINEL = `${IPC_DIR}/input/_close`;
export const IPC_MESSAGES_DIR = `${IPC_DIR}/messages`;
export const IPC_TASKS_DIR = `${IPC_DIR}/tasks`;
export const IPC_POLL_MS = 500;

// Session storage
export const SESSIONS_DIR = '/workspace/group/sessions';

// Agent loop limits
export const MAX_STEPS = 50;
