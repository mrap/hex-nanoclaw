import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { handleSkillCreate, handleSkillPatch } from './ipc-skill-handler.js';

const validContent = `---
name: test-skill
description: A test skill
---
# Test Skill

This is the body.
`;

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('handleSkillCreate', () => {
  it('writes a valid skill file', async () => {
    const result = await handleSkillCreate(
      { name: 'test-skill', content: validContent },
      'group-a',
      tmpDir,
    );
    expect(result.success).toBe(true);
    const written = fs.readFileSync(
      path.join(tmpDir, 'group-a', 'skills', 'test-skill', 'SKILL.md'),
      'utf-8',
    );
    expect(written).toBe(validContent);
  });

  it('rejects security-flagged content', async () => {
    const badContent = `---
name: bad-skill
description: Dangerous
---
rm -rf / --no-preserve-root
`;
    const result = await handleSkillCreate(
      { name: 'bad-skill', content: badContent },
      'group-a',
      tmpDir,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Security scan');
  });

  it('rejects invalid frontmatter', async () => {
    const result = await handleSkillCreate(
      { name: 'no-fm', content: 'just text' },
      'group-a',
      tmpDir,
    );
    expect(result.success).toBe(false);
  });

  it('rejects name mismatch between IPC and frontmatter', async () => {
    const content = `---
name: different-name
description: Mismatch
---
Body.
`;
    const result = await handleSkillCreate(
      { name: 'test-skill', content },
      'group-a',
      tmpDir,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('does not match');
  });

  it('overwrites existing skill', async () => {
    await handleSkillCreate(
      { name: 'test-skill', content: validContent },
      'group-a',
      tmpDir,
    );
    const updatedContent = validContent.replace(
      'This is the body.',
      'Updated body.',
    );
    const result = await handleSkillCreate(
      { name: 'test-skill', content: updatedContent },
      'group-a',
      tmpDir,
    );
    expect(result.success).toBe(true);
    const written = fs.readFileSync(
      path.join(tmpDir, 'group-a', 'skills', 'test-skill', 'SKILL.md'),
      'utf-8',
    );
    expect(written).toContain('Updated body');
  });
});

describe('handleSkillPatch', () => {
  const setupSkill = () => {
    const skillDir = path.join(tmpDir, 'group-a', 'skills', 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), validContent, 'utf-8');
  };

  it('patches with exact match', () => {
    setupSkill();
    const result = handleSkillPatch(
      {
        name: 'test-skill',
        find: 'This is the body.',
        replace: 'Patched body.',
      },
      'group-a',
      tmpDir,
    );
    expect(result.success).toBe(true);
    const patched = fs.readFileSync(
      path.join(tmpDir, 'group-a', 'skills', 'test-skill', 'SKILL.md'),
      'utf-8',
    );
    expect(patched).toContain('Patched body.');
  });

  it('returns error when find string not found', () => {
    setupSkill();
    const result = handleSkillPatch(
      { name: 'test-skill', find: 'nonexistent text', replace: 'something' },
      'group-a',
      tmpDir,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('rolls back if patched content fails security scan', () => {
    setupSkill();
    const result = handleSkillPatch(
      {
        name: 'test-skill',
        find: 'This is the body.',
        replace: 'rm -rf / --no-preserve-root',
      },
      'group-a',
      tmpDir,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Security scan');
    // Verify original content preserved
    const content = fs.readFileSync(
      path.join(tmpDir, 'group-a', 'skills', 'test-skill', 'SKILL.md'),
      'utf-8',
    );
    expect(content).toContain('This is the body.');
  });

  it('returns error for nonexistent skill', () => {
    const result = handleSkillPatch(
      { name: 'missing-skill', find: 'x', replace: 'y' },
      'group-a',
      tmpDir,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('uses whitespace-normalized matching as fallback', () => {
    const skillDir = path.join(tmpDir, 'group-a', 'skills', 'ws-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    const content = `---
name: ws-skill
description: Whitespace test
---
This   is   spaced   out.
`;
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8');

    const result = handleSkillPatch(
      {
        name: 'ws-skill',
        find: 'This is spaced out.',
        replace: 'Normalized match.',
      },
      'group-a',
      tmpDir,
    );
    expect(result.success).toBe(true);
    const patched = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
    expect(patched).toContain('Normalized match.');
  });
});
