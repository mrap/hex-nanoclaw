import { describe, it, expect } from 'vitest';

import { ChatInfo } from './db.js';
import { autoRegisterGroups, GroupsConfig } from './group-auto-register.js';
import { RegisteredGroup } from './types.js';

function makeConfig(overrides?: Partial<GroupsConfig>): GroupsConfig {
  return {
    groups: {
      main: {
        name: 'hex',
        folder: 'main',
        channels: { slack: 'hex-main' },
        isMain: true,
        additionalMounts: [
          {
            hostPath: '~/mrap-hex',
            containerPath: 'mrap-hex',
            readonly: false,
          },
        ],
      },
      ops: {
        name: 'ops',
        folder: 'ops',
        channels: { slack: 'hex-ops' },
      },
      boi: {
        name: 'boi',
        folder: 'boi',
        channels: { slack: 'hex-boi' },
      },
      gws: {
        name: 'gws',
        folder: 'gws',
        channels: { slack: 'hex-gws' },
      },
    },
    ...overrides,
  };
}

function makeChats(): ChatInfo[] {
  return [
    {
      jid: 'slack:C001',
      name: 'hex-main',
      channel: 'slack',
      is_group: 1,
      last_message_time: '2026-04-01T00:00:00Z',
    },
    {
      jid: 'slack:C002',
      name: 'hex-ops',
      channel: 'slack',
      is_group: 1,
      last_message_time: '2026-04-01T00:00:00Z',
    },
    {
      jid: 'slack:C003',
      name: 'hex-boi',
      channel: 'slack',
      is_group: 1,
      last_message_time: '2026-04-01T00:00:00Z',
    },
    {
      jid: 'slack:C004',
      name: 'hex-gws',
      channel: 'slack',
      is_group: 1,
      last_message_time: '2026-04-01T00:00:00Z',
    },
  ];
}

describe('autoRegisterGroups', () => {
  it('registers all groups matched by channel name', () => {
    const registered: Array<{ jid: string; group: RegisteredGroup }> = [];
    const registerFn = (jid: string, group: RegisteredGroup) => {
      registered.push({ jid, group });
    };

    const count = autoRegisterGroups(
      makeConfig(),
      'slack',
      makeChats(),
      new Set(),
      registerFn,
    );

    expect(count).toBe(4);
    expect(registered).toHaveLength(4);

    const names = registered.map((r) => r.group.name).sort();
    expect(names).toEqual(['boi', 'gws', 'hex', 'ops']);
  });

  it('sets isMain and requiresTrigger correctly for main group', () => {
    const registered: Array<{ jid: string; group: RegisteredGroup }> = [];
    const registerFn = (jid: string, group: RegisteredGroup) => {
      registered.push({ jid, group });
    };

    autoRegisterGroups(
      makeConfig(),
      'slack',
      makeChats(),
      new Set(),
      registerFn,
    );

    const mainGroup = registered.find((r) => r.group.name === 'hex');
    expect(mainGroup).toBeDefined();
    expect(mainGroup!.group.isMain).toBe(true);
    expect(mainGroup!.group.requiresTrigger).toBe(false);

    const opsGroup = registered.find((r) => r.group.name === 'ops');
    expect(opsGroup).toBeDefined();
    expect(opsGroup!.group.isMain).toBeUndefined();
    expect(opsGroup!.group.requiresTrigger).toBe(true);
  });

  it('skips already-registered groups', () => {
    const registered: Array<{ jid: string; group: RegisteredGroup }> = [];
    const registerFn = (jid: string, group: RegisteredGroup) => {
      registered.push({ jid, group });
    };

    const alreadyRegistered = new Set(['slack:C001', 'slack:C003']);
    const count = autoRegisterGroups(
      makeConfig(),
      'slack',
      makeChats(),
      alreadyRegistered,
      registerFn,
    );

    expect(count).toBe(2);
    const names = registered.map((r) => r.group.name).sort();
    expect(names).toEqual(['gws', 'ops']);
  });

  it('skips groups with no matching discovered channel', () => {
    const registered: Array<{ jid: string; group: RegisteredGroup }> = [];
    const registerFn = (jid: string, group: RegisteredGroup) => {
      registered.push({ jid, group });
    };

    const partialChats: ChatInfo[] = [
      {
        jid: 'slack:C001',
        name: 'hex-main',
        channel: 'slack',
        is_group: 1,
        last_message_time: '2026-04-01T00:00:00Z',
      },
      {
        jid: 'slack:C002',
        name: 'hex-ops',
        channel: 'slack',
        is_group: 1,
        last_message_time: '2026-04-01T00:00:00Z',
      },
    ];

    const count = autoRegisterGroups(
      makeConfig(),
      'slack',
      partialChats,
      new Set(),
      registerFn,
    );

    expect(count).toBe(2);
    const names = registered.map((r) => r.group.name).sort();
    expect(names).toEqual(['hex', 'ops']);
  });

  it('skips groups with no channel mapping for the active channel type', () => {
    const registered: Array<{ jid: string; group: RegisteredGroup }> = [];
    const registerFn = (jid: string, group: RegisteredGroup) => {
      registered.push({ jid, group });
    };

    // Use telegram as channel type, but config only has slack mappings
    const count = autoRegisterGroups(
      makeConfig(),
      'telegram',
      makeChats(),
      new Set(),
      registerFn,
    );

    expect(count).toBe(0);
    expect(registered).toHaveLength(0);
  });

  it('includes additionalMounts in containerConfig', () => {
    const registered: Array<{ jid: string; group: RegisteredGroup }> = [];
    const registerFn = (jid: string, group: RegisteredGroup) => {
      registered.push({ jid, group });
    };

    autoRegisterGroups(
      makeConfig(),
      'slack',
      makeChats(),
      new Set(),
      registerFn,
    );

    const mainGroup = registered.find((r) => r.group.name === 'hex');
    expect(mainGroup!.group.containerConfig).toBeDefined();
    expect(mainGroup!.group.containerConfig!.additionalMounts).toHaveLength(1);
    expect(
      mainGroup!.group.containerConfig!.additionalMounts![0].hostPath,
    ).toBe('~/mrap-hex');

    // Groups without additionalMounts should not have containerConfig
    const opsGroup = registered.find((r) => r.group.name === 'ops');
    expect(opsGroup!.group.containerConfig).toBeUndefined();
  });
});
