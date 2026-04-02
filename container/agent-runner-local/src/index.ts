/**
 * NanoClaw Agent Runner — Local Model Edition
 * Runs inside a container, receives config via stdin, outputs result to stdout.
 *
 * Input protocol:  Same as agent-runner (JSON via stdin)
 * Output protocol: Same OUTPUT_START_MARKER / OUTPUT_END_MARKER pairs
 * IPC protocol:    Same /workspace/ipc/input/ polling for follow-up messages
 *
 * Key difference: uses Ollama (via Vercel AI SDK) instead of Claude SDK.
 */

import fs from 'fs';
import path from 'path';
import {
  OUTPUT_START_MARKER,
  OUTPUT_END_MARKER,
  IPC_INPUT_DIR,
  IPC_INPUT_CLOSE_SENTINEL,
  IPC_POLL_MS,
} from './config.js';
import { runAgentLoop } from './agent-loop.js';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
  script?: string;
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(msg: string): void {
  console.error(`[agent-runner-local] ${msg}`);
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function shouldClose(): boolean {
  if (fs.existsSync(IPC_INPUT_CLOSE_SENTINEL)) {
    try {
      fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL);
    } catch {
      /* ignore */
    }
    return true;
  }
  return false;
}

function drainIpcInput(): string[] {
  try {
    fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
    const files = fs
      .readdirSync(IPC_INPUT_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();

    const messages: string[] = [];
    for (const file of files) {
      const filePath = path.join(IPC_INPUT_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        fs.unlinkSync(filePath);
        if (data.type === 'message' && data.text) {
          messages.push(data.text);
        }
      } catch {
        try {
          fs.unlinkSync(filePath);
        } catch {
          /* ignore */
        }
      }
    }
    return messages;
  } catch {
    return [];
  }
}

function waitForIpcMessage(): Promise<string | null> {
  return new Promise((resolve) => {
    const poll = () => {
      if (shouldClose()) {
        resolve(null);
        return;
      }
      const messages = drainIpcInput();
      if (messages.length > 0) {
        resolve(messages.join('\n'));
        return;
      }
      setTimeout(poll, IPC_POLL_MS);
    };
    poll();
  });
}

async function main(): Promise<void> {
  let containerInput: ContainerInput;

  try {
    const stdinData = await readStdin();
    containerInput = JSON.parse(stdinData);
    log(`Received input for group: ${containerInput.groupFolder}`);
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`,
    });
    process.exit(1);
  }

  fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
  // Clean up stale close sentinel
  try {
    fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL);
  } catch {
    /* ignore */
  }

  let prompt = containerInput.prompt;
  if (containerInput.isScheduledTask) {
    prompt = `[SCHEDULED TASK - The following message was sent automatically and is not coming directly from the user or group.]\n\n${prompt}`;
  }

  // Drain any pending IPC messages into initial prompt
  const pending = drainIpcInput();
  if (pending.length > 0) {
    prompt += '\n' + pending.join('\n');
  }

  let sessionId = containerInput.sessionId;

  // Main query-then-wait loop (mirrors agent-runner's query loop)
  while (true) {
    log(`Running agent loop (session: ${sessionId || 'new'})...`);

    const result = await runAgentLoop({
      prompt,
      sessionId,
      groupFolder: containerInput.groupFolder,
      chatJid: containerInput.chatJid,
      isMain: containerInput.isMain,
      assistantName: containerInput.assistantName,
    });

    sessionId = result.newSessionId;

    if (result.error) {
      writeOutput({
        status: 'error',
        result: null,
        newSessionId: sessionId,
        error: result.error,
      });
      process.exit(1);
    }

    writeOutput({
      status: 'success',
      result: result.text,
      newSessionId: sessionId,
    });

    // Emit session-update marker so host tracks session ID
    writeOutput({ status: 'success', result: null, newSessionId: sessionId });

    log('Loop iteration done, waiting for next IPC message...');

    const nextMessage = await waitForIpcMessage();
    if (nextMessage === null) {
      log('Close sentinel received, exiting');
      break;
    }

    log(`Got new message (${nextMessage.length} chars), continuing loop`);
    prompt = nextMessage;
  }
}

main().catch((err) => {
  console.error(`[agent-runner-local] Fatal error: ${err.message}`);
  process.exit(1);
});
