import fs from 'fs';
import path from 'path';

import { atomicWriteSync } from './atomic-write.js';
import { logger } from './logger.js';
import {
  NAME_PATTERN,
  parseFrontmatter,
  scanSkillContent,
  ScanResult,
} from './skill-scanner.js';

export interface SkillCreateResult {
  success: boolean;
  error?: string;
  scanResult?: ScanResult;
}

export interface SkillPatchResult {
  success: boolean;
  error?: string;
  scanResult?: ScanResult;
}

function applyPatch(
  original: string,
  find: string,
  replace: string,
): string | null {
  if (original.includes(find)) {
    return original.replace(find, replace);
  }
  // Whitespace-normalized sliding window
  const normalizeWs = (s: string) => s.replace(/\s+/g, ' ').trim();
  const normalizedFind = normalizeWs(find);
  const lines = original.split('\n');
  for (let start = 0; start < lines.length; start++) {
    for (let end = start + 1; end <= lines.length; end++) {
      const chunk = lines.slice(start, end).join('\n');
      if (normalizeWs(chunk) === normalizedFind) {
        return original.replace(chunk, replace);
      }
    }
  }
  return null;
}

function extractFrontmatterName(content: string): string | null {
  const { frontmatter } = parseFrontmatter(content);
  if (!frontmatter || typeof frontmatter.name !== 'string') return null;
  return frontmatter.name;
}

export async function handleSkillCreate(
  data: { name: string; content: string },
  sourceGroup: string,
  sessionsDir: string,
): Promise<SkillCreateResult> {
  // Validate name format
  if (!data.name || !NAME_PATTERN.test(data.name)) {
    logger.warn(
      { name: data.name, sourceGroup },
      'skill_create: invalid name format',
    );
    return { success: false, error: `Invalid skill name: ${data.name}` };
  }

  // Check frontmatter name matches IPC name
  const fmName = extractFrontmatterName(data.content);
  if (fmName && fmName !== data.name) {
    logger.warn(
      { name: data.name, fmName, sourceGroup },
      'skill_create: name mismatch',
    );
    return {
      success: false,
      error: `Frontmatter name "${fmName}" does not match IPC name "${data.name}"`,
    };
  }

  // Security scan
  const scanResult = scanSkillContent(data.content);
  if (scanResult.verdict === 'rejected') {
    logger.warn(
      { name: data.name, sourceGroup, findings: scanResult.findings.length },
      'skill_create: security scan rejected',
    );
    return {
      success: false,
      error: 'Security scan rejected skill content',
      scanResult,
    };
  }

  // Write skill file
  const skillDir = path.join(sessionsDir, sourceGroup, 'skills', data.name);
  const skillPath = path.join(skillDir, 'SKILL.md');
  try {
    atomicWriteSync(skillPath, data.content);
    logger.info(
      { name: data.name, sourceGroup, path: skillPath },
      'Skill created',
    );
    return { success: true, scanResult };
  } catch (err: any) {
    logger.error(
      { name: data.name, sourceGroup, error: err.message },
      'skill_create: write failed',
    );
    return { success: false, error: `Write failed: ${err.message}` };
  }
}

export function handleSkillPatch(
  data: { name: string; find: string; replace: string },
  sourceGroup: string,
  sessionsDir: string,
): SkillPatchResult {
  if (!data.name || !NAME_PATTERN.test(data.name)) {
    return { success: false, error: `Invalid skill name: ${data.name}` };
  }

  const skillPath = path.join(
    sessionsDir,
    sourceGroup,
    'skills',
    data.name,
    'SKILL.md',
  );
  if (!fs.existsSync(skillPath)) {
    return { success: false, error: `Skill "${data.name}" not found` };
  }

  const original = fs.readFileSync(skillPath, 'utf-8');

  // Try exact match first, then whitespace-normalized
  const patched = applyPatch(original, data.find, data.replace);
  if (patched === null) {
    return {
      success: false,
      error:
        'Find string not found in skill content (exact and whitespace-normalized)',
    };
  }

  const scanResult = scanSkillContent(patched);
  if (scanResult.verdict === 'rejected') {
    logger.warn(
      { name: data.name, sourceGroup },
      'skill_patch: security scan rejected patched content, rolling back',
    );
    return {
      success: false,
      error: 'Security scan rejected patched content',
      scanResult,
    };
  }

  try {
    atomicWriteSync(skillPath, patched);
    logger.info({ name: data.name, sourceGroup }, 'Skill patched');
    return { success: true, scanResult };
  } catch (err: any) {
    return { success: false, error: `Write failed: ${err.message}` };
  }
}
