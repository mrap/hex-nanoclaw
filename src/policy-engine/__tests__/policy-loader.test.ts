import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { PolicyLoader } from '../policy-loader.js';
import { EventStore } from '../event-store.js';

let tmpDir: string;
let db: Database.Database;
let store: EventStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-test-'));
  db = new Database(':memory:');
  store = new EventStore(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true });
});

describe('PolicyLoader', () => {
  it('loads policies from YAML files', () => {
    const yamlContent = `
name: test-policy
description: A test policy
lifecycle: persistent
enabled: true
rules:
  - name: test-rule
    trigger:
      event: "test.event"
    actions:
      - type: emit
        event: chained.event
`;
    fs.writeFileSync(path.join(tmpDir, 'test.yaml'), yamlContent);

    const loader = new PolicyLoader(tmpDir, store);
    const policies = loader.loadAll();

    expect(policies).toHaveLength(1);
    expect(policies[0].name).toBe('test-policy');
    expect(policies[0].rules[0].trigger.event).toBe('test.event');
  });

  it('loads policies from SQLite', () => {
    const yamlContent = `
name: db-policy
lifecycle: persistent
enabled: true
rules:
  - name: db-rule
    trigger:
      event: "db.event"
    actions:
      - type: shell
        command: echo hi
`;
    db.prepare(
      `INSERT INTO policies (name, yaml_content, source, enabled) VALUES (?, ?, ?, ?)`,
    ).run('db-policy', yamlContent, 'llm', 1);

    const loader = new PolicyLoader(tmpDir, store);
    const policies = loader.loadAll();

    expect(policies).toHaveLength(1);
    expect(policies[0].name).toBe('db-policy');
    expect(policies[0].source).toBe('llm');
  });

  it('skips disabled policies', () => {
    const yaml = `
name: disabled
lifecycle: persistent
enabled: false
rules:
  - name: r
    trigger:
      event: x
    actions:
      - type: emit
        event: y
`;
    fs.writeFileSync(path.join(tmpDir, 'disabled.yaml'), yaml);

    const loader = new PolicyLoader(tmpDir, store);
    const policies = loader.loadAll();
    expect(policies).toHaveLength(0);
  });

  it('defaults lifecycle to persistent', () => {
    const yaml = `
name: no-lifecycle
enabled: true
rules:
  - name: r
    trigger:
      event: x
    actions:
      - type: emit
        event: y
`;
    fs.writeFileSync(path.join(tmpDir, 'no-lifecycle.yaml'), yaml);

    const loader = new PolicyLoader(tmpDir, store);
    const policies = loader.loadAll();
    expect(policies[0].lifecycle).toBe('persistent');
  });

  it('detects file changes on reload', () => {
    const yaml1 = `
name: evolving
lifecycle: persistent
enabled: true
rules:
  - name: r
    trigger:
      event: first
    actions:
      - type: emit
        event: y
`;
    const filePath = path.join(tmpDir, 'evolving.yaml');
    fs.writeFileSync(filePath, yaml1);

    const loader = new PolicyLoader(tmpDir, store);
    let policies = loader.loadAll();
    expect(policies[0].rules[0].trigger.event).toBe('first');

    const yaml2 = yaml1.replace('first', 'second');
    fs.writeFileSync(filePath, yaml2);

    const stat = fs.statSync(filePath);
    fs.utimesSync(filePath, stat.atime, new Date(stat.mtimeMs + 1000));

    policies = loader.loadAll();
    expect(policies[0].rules[0].trigger.event).toBe('second');
  });

  it('uses cached policies when file has not changed', () => {
    const yaml = `
name: cached-test
lifecycle: persistent
enabled: true
rules:
  - name: r
    trigger:
      event: test
    actions:
      - type: emit
        event: y
`;
    fs.writeFileSync(path.join(tmpDir, 'cached.yaml'), yaml);

    const loader = new PolicyLoader(tmpDir, store);
    const first = loader.loadAll();
    const second = loader.loadAll();

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0].name).toBe(second[0].name);
  });

  it('skips unknown action types instead of creating shell echo', () => {
    const yaml = `
name: unknown-action
lifecycle: persistent
enabled: true
rules:
  - name: r
    trigger:
      event: test
    actions:
      - type: unknown_type
        foo: bar
      - type: emit
        event: valid
`;
    fs.writeFileSync(path.join(tmpDir, 'unknown.yaml'), yaml);

    const loader = new PolicyLoader(tmpDir, store);
    const policies = loader.loadAll();

    expect(policies[0].rules[0].actions).toHaveLength(1);
    expect(policies[0].rules[0].actions[0].type).toBe('emit');
  });
});
