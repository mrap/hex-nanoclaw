/**
 * Agentic loop for the local model agent runner.
 *
 * Uses Vercel AI SDK's generateText with maxSteps to handle the
 * prompt → model response → tool calls → results → repeat cycle.
 */

import fs from 'fs';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { CoreMessage } from 'ai';
import {
  LOCAL_MODEL_URL,
  MODEL_NAME,
  OUTPUT_START_MARKER,
  OUTPUT_END_MARKER,
  MAX_STEPS,
} from './config.js';
import { buildAllTools } from './tools.js';
import { loadSession, saveSession, generateSessionId } from './session.js';

export interface AgentLoopInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  assistantName?: string;
}

export interface AgentLoopResult {
  newSessionId: string;
  text: string | null;
  error?: string;
}

function writeOutput(output: {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(msg: string): void {
  console.error(`[agent-runner-local] ${msg}`);
}

function loadSystemPrompt(): string {
  const claudeMdPath = '/workspace/group/CLAUDE.md';
  if (fs.existsSync(claudeMdPath)) {
    return fs.readFileSync(claudeMdPath, 'utf-8');
  }
  return 'You are a helpful assistant.';
}

function loadMemoryContext(): string {
  const MAX_MEMORY = 4096;
  const MAX_USER = 2048;
  let ctx = '';

  const memPath = '/workspace/group/MEMORY.md';
  const userPath = '/workspace/group/USER.md';

  if (fs.existsSync(memPath)) {
    const content = fs.readFileSync(memPath, 'utf-8').slice(0, MAX_MEMORY).trim();
    if (content) {
      ctx +=
        '\n\n## Agent Memory (frozen snapshot — updates via memory_update tool write to disk, visible next session)\n' +
        content +
        '\n';
    }
  }
  if (fs.existsSync(userPath)) {
    const content = fs.readFileSync(userPath, 'utf-8').slice(0, MAX_USER).trim();
    if (content) {
      ctx += '\n\n## User Preferences (frozen snapshot)\n' + content + '\n';
    }
  }

  return ctx;
}

export async function runAgentLoop(
  input: AgentLoopInput,
): Promise<AgentLoopResult> {
  const sessionId = input.sessionId || generateSessionId();
  const existingMessages = input.sessionId ? loadSession(input.sessionId) : [];

  const systemPromptBase = loadSystemPrompt();
  const memoryCtx = loadMemoryContext();
  const currentDate = `\n\n# currentDate\nToday's date is ${new Date().toISOString().split('T')[0]}.\n`;
  const systemPrompt = systemPromptBase + memoryCtx + currentDate;

  const tools = buildAllTools(input.chatJid, input.groupFolder, input.isMain);

  const ollama = createOpenAI({
    baseURL: `${LOCAL_MODEL_URL}/v1`,
    apiKey: 'ollama',
  });

  // Build messages: history + new user message
  const messages: CoreMessage[] = [
    ...existingMessages,
    { role: 'user', content: input.prompt },
  ];

  log(`Starting agent loop (session=${sessionId}, model=${MODEL_NAME}, history=${existingMessages.length} msgs)`);

  try {
    const result = await generateText({
      model: ollama(MODEL_NAME),
      system: systemPrompt,
      messages,
      tools,
      maxSteps: MAX_STEPS,
      onStepFinish: ({ text, toolCalls, finishReason }) => {
        if (toolCalls && toolCalls.length > 0) {
          log(
            `Step: ${toolCalls.map((tc) => tc.toolName).join(', ')} (finish: ${finishReason})`,
          );
        } else if (text) {
          log(`Step: text response (${text.length} chars, finish: ${finishReason})`);
        }
      },
    });

    // Persist updated conversation
    const updatedMessages: CoreMessage[] = [
      ...messages,
      { role: 'assistant', content: result.text || '' },
    ];
    saveSession(sessionId, updatedMessages);

    log(`Loop complete. Steps: ${result.steps.length}, text: ${result.text?.slice(0, 100) || '(none)'}`);

    return {
      newSessionId: sessionId,
      text: result.text || null,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Agent loop error: ${errorMessage}`);
    return {
      newSessionId: sessionId,
      text: null,
      error: errorMessage,
    };
  }
}
