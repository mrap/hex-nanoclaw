import fs from 'fs';
import path from 'path';

/**
 * Write a file atomically using a temp file + rename.
 * Creates parent directories if they don't exist.
 * Temp file is written in the same directory as the target to avoid
 * cross-device rename failures (EXDEV).
 */
export function atomicWriteSync(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `.nanoclaw-tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}
