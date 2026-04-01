import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../template.js';

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
