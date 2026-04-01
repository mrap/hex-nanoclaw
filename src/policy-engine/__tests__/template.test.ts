import { describe, it, expect } from 'vitest';
import { renderTemplate, renderTemplateShellSafe } from '../template.js';
import { shellEscape } from '../shell-escape.js';

describe('renderTemplate', () => {
  it('interpolates simple fields', () => {
    expect(renderTemplate('hello {{ name }}', { name: 'world' })).toBe(
      'hello world',
    );
  });

  it('interpolates nested fields', () => {
    expect(
      renderTemplate('{{ event.spec_id }}', { event: { spec_id: 'q-100' } }),
    ).toBe('q-100');
  });

  it('returns empty string for missing fields', () => {
    expect(renderTemplate('{{ missing }}', {})).toBe('');
  });

  it('handles multiple interpolations', () => {
    expect(renderTemplate('{{ a }} and {{ b }}', { a: '1', b: '2' })).toBe(
      '1 and 2',
    );
  });

  it('handles no interpolations', () => {
    expect(renderTemplate('plain text', {})).toBe('plain text');
  });

  it('converts numbers to strings', () => {
    expect(renderTemplate('code {{ code }}', { code: 42 })).toBe('code 42');
  });

  it('handles deeply nested paths', () => {
    expect(renderTemplate('{{ a.b.c }}', { a: { b: { c: 'deep' } } })).toBe(
      'deep',
    );
  });
});

describe('shellEscape', () => {
  it('wraps value in single quotes', () => {
    expect(shellEscape('hello')).toBe("'hello'");
  });

  it('escapes embedded single quotes', () => {
    expect(shellEscape("it's")).toBe("'it'\\''s'");
  });

  it('handles empty string', () => {
    expect(shellEscape('')).toBe("''");
  });

  it('escapes semicolons', () => {
    expect(shellEscape('; rm -rf /')).toBe("'; rm -rf /'");
  });

  it('escapes backticks', () => {
    expect(shellEscape('`whoami`')).toBe("'`whoami`'");
  });

  it('escapes $() subshell', () => {
    expect(shellEscape('$(whoami)')).toBe("'$(whoami)'");
  });

  it('escapes pipe characters', () => {
    expect(shellEscape('a | b')).toBe("'a | b'");
  });
});

describe('renderTemplateShellSafe', () => {
  it('escapes interpolated values for shell', () => {
    const result = renderTemplateShellSafe('echo {{ name }}', { name: 'hello world' });
    expect(result).toBe("echo 'hello world'");
  });

  it('escapes dangerous shell characters', () => {
    const result = renderTemplateShellSafe('echo {{ val }}', { val: '; rm -rf /' });
    expect(result).toBe("echo '; rm -rf /'");
  });

  it('returns empty single quotes for missing fields', () => {
    const result = renderTemplateShellSafe('echo {{ missing }}', {});
    expect(result).toBe("echo ''");
  });

  it('handles nested fields with shell escaping', () => {
    const result = renderTemplateShellSafe('echo {{ event.name }}', {
      event: { name: 'safe value' },
    });
    expect(result).toBe("echo 'safe value'");
  });
});
