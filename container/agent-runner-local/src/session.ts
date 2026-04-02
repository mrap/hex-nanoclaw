/**
 * Session management for the local model agent runner.
 * Persists message history to JSONL files so conversations can resume.
 */

import fs from 'fs';
import path from 'path';
import type { CoreMessage } from 'ai';
import { SESSIONS_DIR } from './config.js';

export function sessionPath(sessionId: string): string {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

export function loadSession(sessionId: string): CoreMessage[] {
  const file = sessionPath(sessionId);
  if (!fs.existsSync(file)) return [];
  try {
    const raw = fs.readFileSync(file, 'utf-8').trim();
    if (!raw) return [];
    return JSON.parse(raw) as CoreMessage[];
  } catch {
    return [];
  }
}

export function saveSession(sessionId: string, messages: CoreMessage[]): void {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFileSync(sessionPath(sessionId), JSON.stringify(messages, null, 2), 'utf-8');
}

export function generateSessionId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
