import * as fs from 'fs';
import * as path from 'path';

export interface SessionTag {
  sessionId: string;
  groupId: string;
  messageCount: number;
  toolCallCount: number;
  skillsCreated: string[];
  soViolations: string[];
  errorCount: number;
  tags: string[];
}

export function tagSession(transcriptPath: string): SessionTag {
  const raw = fs.readFileSync(transcriptPath, 'utf-8');
  const events = raw.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const messageCount = events.filter((e: any) => e.type === 'message').length;
  const toolCallCount = events.filter((e: any) => e.type === 'tool_use').length;
  const errorCount = events.filter((e: any) => e.type === 'error' || e.isError).length;
  const skillsCreated: string[] = [];
  const tags: string[] = [];
  if (errorCount > 3) tags.push('high-error');
  if (toolCallCount > 20) tags.push('heavy-tool-use');
  if (messageCount > 10) tags.push('long-session');
  return { sessionId: path.basename(transcriptPath, '.jsonl'), groupId: '', messageCount, toolCallCount, skillsCreated, soViolations: [], errorCount, tags };
}

export function saveTag(tag: SessionTag, outputDir: string): void {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, `${tag.sessionId}.json`), JSON.stringify(tag, null, 2));
}
