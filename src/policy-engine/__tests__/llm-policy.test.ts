import { describe, it, expect } from 'vitest';
import { buildPolicyPrompt, validatePolicyYaml } from '../llm-policy.js';

describe('validatePolicyYaml', () => {
  it('accepts valid policy YAML', () => {
    const yaml = `
name: test
lifecycle: persistent
enabled: true
rules:
  - name: r1
    trigger:
      event: test.event
    actions:
      - type: emit
        event: chained
`;
    const errors = validatePolicyYaml(yaml);
    expect(errors).toHaveLength(0);
  });

  it('rejects policy without name', () => {
    const yaml = `
lifecycle: persistent
rules:
  - name: r1
    trigger:
      event: x
    actions:
      - type: emit
        event: y
`;
    const errors = validatePolicyYaml(yaml);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('name');
  });

  it('rejects policy without rules', () => {
    const yaml = `
name: no-rules
lifecycle: persistent
`;
    const errors = validatePolicyYaml(yaml);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects rule without trigger', () => {
    const yaml = `
name: no-trigger
rules:
  - name: r1
    actions:
      - type: emit
        event: y
`;
    const errors = validatePolicyYaml(yaml);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects unknown action type', () => {
    const yaml = `
name: bad-action
rules:
  - name: r1
    trigger:
      event: x
    actions:
      - type: destroy_everything
`;
    const errors = validatePolicyYaml(yaml);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects emit action without event field', () => {
    const yaml = `
name: missing-event
rules:
  - name: r1
    trigger:
      event: x
    actions:
      - type: emit
`;
    const errors = validatePolicyYaml(yaml);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('event');
  });

  it('rejects schedule action without required fields', () => {
    const yaml = `
name: missing-schedule-fields
rules:
  - name: r1
    trigger:
      event: x
    actions:
      - type: schedule
`;
    const errors = validatePolicyYaml(yaml);
    expect(errors.length).toBeGreaterThanOrEqual(2); // missing group and prompt
  });

  it('rejects rule without name', () => {
    const yaml = `
name: no-rule-name
rules:
  - trigger:
      event: x
    actions:
      - type: emit
        event: y
`;
    const errors = validatePolicyYaml(yaml);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('name');
  });

  it('returns error for malformed YAML', () => {
    const yaml = `
name: bad
  rules:
    - this is: [broken
`;
    const errors = validatePolicyYaml(yaml);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('YAML');
  });

  it('rejects empty rules array', () => {
    const yaml = `
name: empty-rules
rules: []
`;
    const errors = validatePolicyYaml(yaml);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('buildPolicyPrompt', () => {
  it('includes the user request', () => {
    const prompt = buildPolicyPrompt('alert me when BOI fails');
    expect(prompt).toContain('alert me when BOI fails');
  });

  it('includes the event catalog', () => {
    const prompt = buildPolicyPrompt(
      'test',
      'boi.spec.completed: A BOI spec completed',
    );
    expect(prompt).toContain('boi.spec.completed');
  });
});
