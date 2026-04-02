import * as fs from 'fs';
import * as path from 'path';
import { tagSession, saveTag } from './trajectory-tagger';
import { detectViolations } from './so-violation-detector';

export interface PipelineResult {
  sessionId: string;
  tagged: boolean;
  violations: number;
  highSeverityViolations: number;
}

export function runSessionEndPipeline(
  transcriptPath: string,
  outputDir: string,
  emitFn?: (event: string, payload: Record<string, unknown>) => void
): PipelineResult {
  if (!fs.existsSync(transcriptPath)) throw new Error(`Transcript not found: ${transcriptPath}`);
  const tag = tagSession(transcriptPath);
  const lines = fs.readFileSync(transcriptPath, 'utf-8').split('\n').filter(Boolean);
  const violations = detectViolations(lines);
  tag.soViolations = violations.map(v => `SO#${v.soNumber}`);
  saveTag(tag, path.join(outputDir, 'session-tags'));
  const highSeverity = violations.filter(v => v.severity === 'high');
  emitFn?.('session.tagged', { sessionId: tag.sessionId, tags: tag.tags });
  if (violations.length > 0) {
    emitFn?.('session.so_violations', { sessionId: tag.sessionId, count: violations.length, highCount: highSeverity.length });
  }
  return { sessionId: tag.sessionId, tagged: true, violations: violations.length, highSeverityViolations: highSeverity.length };
}
