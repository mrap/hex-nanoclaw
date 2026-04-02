/**
 * Tool definitions for the local model agent runner.
 *
 * Two categories:
 * 1. Filesystem tools: read_file, write_file, edit_file, bash, glob, grep
 * 2. NanoClaw IPC tools: send_message, schedule_task, list_tasks, memory_update, etc.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { tool } from 'ai';
import { z } from 'zod';
import fg from 'fast-glob';
import {
  IPC_MESSAGES_DIR,
  IPC_TASKS_DIR,
} from './config.js';

// --- Helpers ---

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);
  return filename;
}

// --- Filesystem tools ---

export const readFileTool = tool({
  description: 'Read the contents of a file from the filesystem.',
  parameters: z.object({
    path: z.string().describe('Absolute or relative path to the file'),
  }),
  execute: async ({ path: filePath }) => {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

export const writeFileTool = tool({
  description: 'Write content to a file, creating it if it does not exist.',
  parameters: z.object({
    path: z.string().describe('Absolute or relative path to the file'),
    content: z.string().describe('Content to write'),
  }),
  execute: async ({ path: filePath, content }) => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
      return `Written ${content.length} bytes to ${filePath}`;
    } catch (err) {
      return `Error writing file: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

export const editFileTool = tool({
  description:
    'Edit a file by replacing an exact string with new content. The old_str must appear exactly once in the file.',
  parameters: z.object({
    path: z.string().describe('Path to the file to edit'),
    old_str: z.string().describe('Exact string to find and replace'),
    new_str: z.string().describe('Replacement string'),
  }),
  execute: async ({ path: filePath, old_str, new_str }) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const count = content.split(old_str).length - 1;
      if (count === 0) return `Error: old_str not found in ${filePath}`;
      if (count > 1) return `Error: old_str appears ${count} times — must be unique`;
      fs.writeFileSync(filePath, content.replace(old_str, new_str), 'utf-8');
      return `Edited ${filePath} successfully`;
    } catch (err) {
      return `Error editing file: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

export const bashTool = tool({
  description:
    'Run a bash command and return its output. Times out after 30 seconds.',
  parameters: z.object({
    command: z.string().describe('Bash command to execute'),
  }),
  execute: async ({ command }) => {
    try {
      const output = execSync(command, {
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return output || '(no output)';
    } catch (err) {
      if (err instanceof Error && 'stdout' in err) {
        const execErr = err as { stdout?: string; stderr?: string };
        return [execErr.stdout, execErr.stderr].filter(Boolean).join('\n') ||
          err.message;
      }
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

export const globTool = tool({
  description: 'Find files matching a glob pattern.',
  parameters: z.object({
    pattern: z.string().describe('Glob pattern, e.g. "src/**/*.ts"'),
    cwd: z
      .string()
      .optional()
      .describe('Base directory for the glob (default: current directory)'),
  }),
  execute: async ({ pattern, cwd }) => {
    try {
      const files = await fg(pattern, {
        cwd: cwd || process.cwd(),
        onlyFiles: true,
        dot: false,
      });
      if (files.length === 0) return 'No files found';
      return files.join('\n');
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

export const grepTool = tool({
  description: 'Search for a pattern in files using grep.',
  parameters: z.object({
    pattern: z.string().describe('Regex pattern to search for'),
    path: z
      .string()
      .optional()
      .describe('File or directory to search in (default: current directory)'),
    glob: z.string().optional().describe('File glob filter, e.g. "*.ts"'),
  }),
  execute: async ({ pattern, path: searchPath, glob: globPattern }) => {
    try {
      const args = ['-r', '-n', '--include', globPattern || '*'];
      const target = searchPath || '.';
      const cmd = `grep -r -n ${globPattern ? `--include="${globPattern}"` : ''} ${JSON.stringify(pattern)} ${JSON.stringify(target)} 2>/dev/null | head -100`;
      const output = execSync(cmd, {
        timeout: 10_000,
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();
      return output || 'No matches found';
    } catch (err) {
      if (err instanceof Error && 'status' in err && (err as NodeJS.ErrnoException & { status: number }).status === 1) {
        return 'No matches found';
      }
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

// --- NanoClaw IPC tools ---
// These write IPC files just like ipc-mcp-stdio.ts, without needing an MCP subprocess.

export function buildIpcTools(chatJid: string, groupFolder: string, isMain: boolean) {
  const sendMessageTool = tool({
    description:
      "Send a message to the user or group immediately while you're still running.",
    parameters: z.object({
      text: z.string().describe('The message text to send'),
      sender: z
        .string()
        .optional()
        .describe('Your role/identity name (e.g. "Researcher")'),
    }),
    execute: async ({ text, sender }) => {
      writeIpcFile(IPC_MESSAGES_DIR, {
        type: 'message',
        chatJid,
        text,
        sender: sender || undefined,
        groupFolder,
        timestamp: new Date().toISOString(),
      });
      return 'Message sent.';
    },
  });

  const scheduleTaskTool = tool({
    description:
      'Schedule a recurring or one-time task. Returns the task ID for future reference.',
    parameters: z.object({
      prompt: z.string().describe('What the agent should do when the task runs'),
      schedule_type: z
        .enum(['cron', 'interval', 'once'])
        .describe('cron=recurring, interval=every N ms, once=run once'),
      schedule_value: z
        .string()
        .describe(
          'cron: "0 9 * * *" | interval: milliseconds "300000" | once: "2026-02-01T15:30:00"',
        ),
      context_mode: z
        .enum(['group', 'isolated'])
        .default('group')
        .describe('group=with chat history, isolated=fresh session'),
      script: z
        .string()
        .optional()
        .describe(
          'Optional bash script to run before waking agent. Must output JSON: { wakeAgent: boolean, data?: any }',
        ),
    }),
    execute: async ({ prompt, schedule_type, schedule_value, context_mode, script }) => {
      const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      writeIpcFile(IPC_TASKS_DIR, {
        type: 'schedule_task',
        taskId,
        prompt,
        script: script || undefined,
        schedule_type,
        schedule_value,
        context_mode: context_mode || 'group',
        targetJid: chatJid,
        createdBy: groupFolder,
        timestamp: new Date().toISOString(),
      });
      return `Task ${taskId} scheduled: ${schedule_type} - ${schedule_value}`;
    },
  });

  const listTasksTool = tool({
    description: "List all scheduled tasks for this group.",
    parameters: z.object({}),
    execute: async () => {
      const tasksFile = '/workspace/ipc/current_tasks.json';
      try {
        if (!fs.existsSync(tasksFile)) return 'No scheduled tasks found.';
        const allTasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
        const tasks = isMain
          ? allTasks
          : allTasks.filter(
              (t: { groupFolder: string }) => t.groupFolder === groupFolder,
            );
        if (tasks.length === 0) return 'No scheduled tasks found.';
        return tasks
          .map(
            (t: {
              id: string;
              prompt: string;
              schedule_type: string;
              schedule_value: string;
              status: string;
              next_run: string | null;
            }) =>
              `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}, next: ${t.next_run || 'N/A'}`,
          )
          .join('\n');
      } catch (err) {
        return `Error reading tasks: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });

  const cancelTaskTool = tool({
    description: 'Cancel and delete a scheduled task.',
    parameters: z.object({
      task_id: z.string().describe('The task ID to cancel'),
    }),
    execute: async ({ task_id }) => {
      writeIpcFile(IPC_TASKS_DIR, {
        type: 'cancel_task',
        taskId: task_id,
        groupFolder,
        isMain,
        timestamp: new Date().toISOString(),
      });
      return `Task ${task_id} cancellation requested.`;
    },
  });

  const memoryUpdateTool = tool({
    description:
      'Update bounded agent memory (MEMORY.md or USER.md). Use after learning something that will reduce future corrections.',
    parameters: z.object({
      store: z.enum(['memory', 'user']).describe('Which store to update'),
      action: z
        .enum(['add', 'remove', 'replace'])
        .describe('add: append. remove: delete by substring. replace: swap.'),
      content: z
        .string()
        .max(2200)
        .describe('The entry content (for add/replace) or substring (for remove)'),
      match: z
        .string()
        .optional()
        .describe('For replace: substring identifying which entry to replace'),
    }),
    execute: async ({ store, action, content, match }) => {
      if (action === 'replace' && !match) {
        return 'replace action requires "match" parameter.';
      }
      writeIpcFile(IPC_TASKS_DIR, {
        type: 'memory_update',
        store,
        action,
        content,
        match,
      });
      return `Memory ${action} request submitted for "${store}" store.`;
    },
  });

  return {
    send_message: sendMessageTool,
    schedule_task: scheduleTaskTool,
    list_tasks: listTasksTool,
    cancel_task: cancelTaskTool,
    memory_update: memoryUpdateTool,
  };
}

export function buildAllTools(chatJid: string, groupFolder: string, isMain: boolean) {
  return {
    read_file: readFileTool,
    write_file: writeFileTool,
    edit_file: editFileTool,
    bash: bashTool,
    glob: globTool,
    grep: grepTool,
    ...buildIpcTools(chatJid, groupFolder, isMain),
  };
}
