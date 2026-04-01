import fs from 'fs';
import path from 'path';

import { atomicWriteSync } from './atomic-write.js';
import { logger } from './logger.js';

export const MEMORY_LIMIT = 2200;
export const USER_LIMIT = 1375;
export const ENTRY_DELIMITER = '\n\u00A7\n';

export interface MemoryUpdateResult {
  success: boolean;
  error?: string;
}

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(previous\s+)?instructions/i,
  /you\s+are\s+now\s+/i,
  /do\s+not\s+tell\s+the\s+user/i,
  /disregard\s+(all\s+)?rules/i,
  /system\s+prompt\s+override/i,
  /curl\b.*\$\w*(KEY|TOKEN|SECRET)/i,
  /authorized_keys/i,
];

function getMemoryPath(groupDir: string, store: string): string {
  return path.join(groupDir, 'memory', `${store}.md`);
}

function readMemory(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function scanForInjection(content: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(content));
}

function getLimit(store: string): number {
  return store === 'user' ? USER_LIMIT : MEMORY_LIMIT;
}

const VALID_STORES = new Set(["memory", "user"]);

export function handleMemoryUpdate(
  data: { store: string; action: string; content: string; match?: string },
  groupDir: string,
): MemoryUpdateResult {
  // Validate store to prevent path traversal
  if (!VALID_STORES.has(data.store)) {
    return { success: false, error: `Invalid store: "${data.store}". Must be "memory" or "user"` };
  }

  const memPath = getMemoryPath(groupDir, data.store);
  const limit = getLimit(data.store);

  switch (data.action) {
    case 'add': {
      // Check injection
      if (scanForInjection(data.content)) {
        logger.warn(
          { store: data.store },
          'memory_update add: injection detected',
        );
        return {
          success: false,
          error: 'Content rejected: injection pattern detected',
        };
      }

      const current = readMemory(memPath);

      // Check duplicate
      if (current && current.includes(data.content)) {
        return { success: false, error: 'Duplicate entry' };
      }

      const newContent = current
        ? current + ENTRY_DELIMITER + data.content
        : data.content;

      // Check limit
      if (newContent.length > limit) {
        return {
          success: false,
          error: `Memory limit exceeded (${newContent.length}/${limit})`,
        };
      }

      atomicWriteSync(memPath, newContent);
      logger.info(
        { store: data.store, size: newContent.length },
        'Memory entry added',
      );
      return { success: true };
    }

    case 'remove': {
      const current = readMemory(memPath);
      if (!current) {
        return { success: false, error: 'Memory store is empty' };
      }

      const entries = current.split(ENTRY_DELIMITER);
      const matching = entries.filter((e) => e.includes(data.content));

      if (matching.length === 0) {
        return { success: false, error: 'No matching entry found' };
      }
      if (matching.length > 1) {
        return {
          success: false,
          error: `Multiple entries match (${matching.length}), be more specific`,
        };
      }

      const remaining = entries.filter((e) => !e.includes(data.content));
      atomicWriteSync(memPath, remaining.join(ENTRY_DELIMITER));
      logger.info({ store: data.store }, 'Memory entry removed');
      return { success: true };
    }

    case 'replace': {
      if (!data.match) {
        return {
          success: false,
          error: 'Replace action requires "match" field',
        };
      }

      // Check injection on new content
      if (scanForInjection(data.content)) {
        logger.warn(
          { store: data.store },
          'memory_update replace: injection detected',
        );
        return {
          success: false,
          error: 'Content rejected: injection pattern detected',
        };
      }

      const current = readMemory(memPath);
      if (!current) {
        return { success: false, error: 'Memory store is empty' };
      }

      const entries = current.split(ENTRY_DELIMITER);
      const matchIdx = entries.findIndex((e) => e.includes(data.match!));

      if (matchIdx === -1) {
        return {
          success: false,
          error: 'No matching entry found for replacement',
        };
      }

      entries[matchIdx] = data.content;
      const newContent = entries.join(ENTRY_DELIMITER);

      if (newContent.length > limit) {
        return {
          success: false,
          error: `Memory limit exceeded after replace (${newContent.length}/${limit})`,
        };
      }

      atomicWriteSync(memPath, newContent);
      logger.info({ store: data.store }, 'Memory entry replaced');
      return { success: true };
    }

    default:
      return { success: false, error: `Unknown action: ${data.action}` };
  }
}
