import { App, LogLevel } from '@slack/bolt';

import { SLACK_BOT_TOKEN, SLACK_APP_TOKEN } from '../config.js';
import { logger } from '../logger.js';
import { Channel, NewMessage } from '../types.js';
import { ChannelOpts, registerChannel } from './registry.js';

export const SLACK_JID_PREFIX = 'slack:';

function toJid(slackChannelId: string): string {
  return `${SLACK_JID_PREFIX}${slackChannelId}`;
}

function fromJid(jid: string): string {
  return jid.slice(SLACK_JID_PREFIX.length);
}

export function createSlackChannel(opts: ChannelOpts): Channel | null {
  if (!SLACK_BOT_TOKEN || !SLACK_APP_TOKEN) {
    return null;
  }

  const app = new App({
    token: SLACK_BOT_TOKEN,
    appToken: SLACK_APP_TOKEN,
    socketMode: true,
    logLevel: LogLevel.WARN,
  });

  let connected = false;

  let botUserId = '';

  /** Cache display names to avoid hitting Slack rate limits on users.info */
  const displayNameCache = new Map<string, string>();

  async function discoverChannels(): Promise<void> {
    try {
      let cursor: string | undefined;
      let count = 0;
      do {
        const result = await app.client.conversations.list({
          types: 'public_channel,private_channel',
          exclude_archived: true,
          limit: 200,
          cursor,
        });

        for (const ch of result.channels || []) {
          if (ch.id && ch.is_member) {
            count++;
            opts.onChatMetadata(
              toJid(ch.id),
              new Date().toISOString(),
              ch.name || ch.id,
              'slack',
              true,
            );
          }
        }
        cursor = result.response_metadata?.next_cursor || undefined;
      } while (cursor);

      logger.info({ channelCount: count }, 'Slack: discovered channels');
    } catch (err) {
      logger.error({ err }, 'Slack: failed to discover channels');
    }
  }

  app.message(async ({ message }) => {
    if (!('user' in message) || !message.user) return;
    if (message.subtype) return;
    if (message.user === botUserId) return;

    const channelId = 'channel' in message ? (message.channel as string) : '';
    if (!channelId) return;

    const jid = toJid(channelId);
    const ts = message.ts || new Date().toISOString();

    let senderName = displayNameCache.get(message.user) ?? '';
    if (!senderName) {
      try {
        const userInfo = await app.client.users.info({ user: message.user });
        senderName =
          userInfo.user?.profile?.display_name ||
          userInfo.user?.real_name ||
          message.user;
      } catch {
        senderName = message.user; /* keep user ID as fallback */
      }
      displayNameCache.set(message.user, senderName);
    }

    const newMessage: NewMessage = {
      id: `slack-${channelId}-${ts}`,
      chat_jid: jid,
      sender: message.user,
      sender_name: senderName,
      content: 'text' in message ? (message.text as string) || '' : '',
      timestamp: new Date(parseFloat(ts) * 1000).toISOString(),
      is_from_me: false,
      is_bot_message: false,
    };

    opts.onMessage(jid, newMessage);
  });

  const channel: Channel = {
    name: 'slack',

    async connect(): Promise<void> {
      await app.start();
      connected = true;

      try {
        const auth = await app.client.auth.test();
        botUserId = (auth.user_id as string) || '';
        logger.info({ botUserId }, 'Slack: connected');
      } catch (err) {
        logger.warn({ err }, 'Slack: could not resolve bot user ID');
      }

      await discoverChannels();
    },

    async sendMessage(jid: string, text: string): Promise<void> {
      const channelId = fromJid(jid);
      await app.client.chat.postMessage({
        channel: channelId,
        text,
      });
    },

    isConnected(): boolean {
      return connected;
    },

    ownsJid(jid: string): boolean {
      return jid.startsWith(SLACK_JID_PREFIX);
    },

    async disconnect(): Promise<void> {
      await app.stop();
      connected = false;
      logger.info('Slack: disconnected');
    },

    async syncGroups(_force: boolean): Promise<void> {
      await discoverChannels();
    },
  };

  return channel;
}

registerChannel('slack', createSlackChannel);
