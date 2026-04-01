import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config before importing slack module
vi.mock('../config.js', () => ({
  SLACK_BOT_TOKEN: 'xoxb-test-token',
  SLACK_APP_TOKEN: 'xapp-test-token',
  ASSISTANT_NAME: 'hex',
}));

// Mock @slack/bolt
const mockSlackClient = {
  chat: {
    postMessage: vi.fn().mockResolvedValue({ ok: true }),
  },
  conversations: {
    list: vi.fn().mockResolvedValue({
      channels: [
        { id: 'C001', name: 'hex', is_member: true },
        { id: 'C002', name: 'hex-ops', is_member: true },
        { id: 'C003', name: 'hex-boi', is_member: true },
        { id: 'C004', name: 'hex-gws', is_member: true },
      ],
      response_metadata: { next_cursor: '' },
    }),
  },
  auth: {
    test: vi.fn().mockResolvedValue({ user_id: 'U_BOT' }),
  },
};

const mockApp = {
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  client: mockSlackClient,
  message: vi.fn(),
};

vi.mock('@slack/bolt', () => ({
  App: vi.fn(function () {
    return mockApp;
  }),
  LogLevel: { WARN: 'warn' },
}));

import { createSlackChannel, SLACK_JID_PREFIX } from './slack.js';

describe('Slack channel adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('JID format', () => {
    it('uses slack: prefix for JIDs', () => {
      expect(SLACK_JID_PREFIX).toBe('slack:');
    });
  });

  describe('factory', () => {
    it('returns null when tokens are missing', async () => {
      // Reset modules so the fresh import picks up the empty-token mock
      vi.resetModules();
      vi.doMock('../config.js', () => ({
        SLACK_BOT_TOKEN: '',
        SLACK_APP_TOKEN: '',
        ASSISTANT_NAME: 'hex',
      }));
      vi.doMock('@slack/bolt', () => ({
        App: vi.fn(function () {
          return mockApp;
        }),
        LogLevel: { WARN: 'warn' },
      }));
      const { createSlackChannel: factory } = await import('./slack.js');
      const channel = factory({
        onMessage: vi.fn(),
        onChatMetadata: vi.fn(),
        registeredGroups: () => ({}),
      });
      expect(channel).toBeNull();
    });

    it('returns a Channel when tokens are configured', () => {
      const channel = createSlackChannel({
        onMessage: vi.fn(),
        onChatMetadata: vi.fn(),
        registeredGroups: () => ({}),
      });
      expect(channel).not.toBeNull();
      expect(channel!.name).toBe('slack');
    });
  });

  describe('ownsJid', () => {
    it('returns true for slack: prefixed JIDs', () => {
      const channel = createSlackChannel({
        onMessage: vi.fn(),
        onChatMetadata: vi.fn(),
        registeredGroups: () => ({}),
      })!;
      expect(channel.ownsJid('slack:C07ABC123')).toBe(true);
    });

    it('returns false for non-slack JIDs', () => {
      const channel = createSlackChannel({
        onMessage: vi.fn(),
        onChatMetadata: vi.fn(),
        registeredGroups: () => ({}),
      })!;
      expect(channel.ownsJid('tg:12345')).toBe(false);
      expect(channel.ownsJid('12345@g.us')).toBe(false);
    });
  });

  describe('connect', () => {
    it('starts the Bolt app and discovers channels', async () => {
      const onChatMetadata = vi.fn();
      const channel = createSlackChannel({
        onMessage: vi.fn(),
        onChatMetadata,
        registeredGroups: () => ({}),
      })!;

      await channel.connect();

      expect(mockApp.start).toHaveBeenCalled();
      expect(channel.isConnected()).toBe(true);
      expect(mockSlackClient.conversations.list).toHaveBeenCalled();
    });

    it('auto-registers discovered channels as groups via onChatMetadata', async () => {
      const onChatMetadata = vi.fn();
      const channel = createSlackChannel({
        onMessage: vi.fn(),
        onChatMetadata,
        registeredGroups: () => ({}),
      })!;

      await channel.connect();

      expect(onChatMetadata).toHaveBeenCalledWith(
        'slack:C001',
        expect.any(String),
        'hex',
        'slack',
        true,
      );
      expect(onChatMetadata).toHaveBeenCalledWith(
        'slack:C002',
        expect.any(String),
        'hex-ops',
        'slack',
        true,
      );
    });
  });

  describe('sendMessage', () => {
    it('posts a message to the correct Slack channel', async () => {
      const channel = createSlackChannel({
        onMessage: vi.fn(),
        onChatMetadata: vi.fn(),
        registeredGroups: () => ({}),
      })!;
      await channel.connect();

      await channel.sendMessage('slack:C001', 'Hello from hex');

      expect(mockSlackClient.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C001',
        text: 'Hello from hex',
      });
    });

    it('extracts channel ID from slack: JID prefix', async () => {
      const channel = createSlackChannel({
        onMessage: vi.fn(),
        onChatMetadata: vi.fn(),
        registeredGroups: () => ({}),
      })!;
      await channel.connect();

      await channel.sendMessage('slack:C999', 'test');

      expect(mockSlackClient.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C999',
        text: 'test',
      });
    });
  });

  describe('disconnect', () => {
    it('stops the Bolt app', async () => {
      const channel = createSlackChannel({
        onMessage: vi.fn(),
        onChatMetadata: vi.fn(),
        registeredGroups: () => ({}),
      })!;
      await channel.connect();
      await channel.disconnect();

      expect(mockApp.stop).toHaveBeenCalled();
      expect(channel.isConnected()).toBe(false);
    });
  });
});
