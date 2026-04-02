/**
 * NanoClaw IPC tool provider.
 *
 * Rather than spawning a separate MCP subprocess, we implement the same IPC
 * file-writing protocol directly. This gives the local runner access to all
 * NanoClaw tools (send_message, schedule_task, memory_update, etc.) without
 * the overhead of stdio MCP transport.
 *
 * The tool implementations mirror ipc-mcp-stdio.ts exactly.
 */

// Re-export the IPC tool builder from tools.ts for use in the agent loop.
export { buildIpcTools } from './tools.js';
