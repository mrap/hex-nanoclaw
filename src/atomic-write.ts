import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Write a file atomically using a temp file + rename.
 * Creates parent directories if they don't exist.
 */
export function atomicWriteSync(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(
    os.tmpdir(),
    `nanoclaw-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}
