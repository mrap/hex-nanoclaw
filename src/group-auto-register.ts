/**
 * Auto-registers agent groups from config/groups.json by matching
 * configured channel names to discovered chats in the database.
 */
import fs from 'fs';
import path from 'path';

import { DEFAULT_TRIGGER } from './config.js';
import { ChatInfo } from './db.js';
import { logger } from './logger.js';
import { AdditionalMount, RegisteredGroup } from './types.js';

export interface GroupConfigEntry {
  name: string;
  folder: string;
  channels?: Record<string, string>;
  isMain?: boolean;
  mcpServers?: Record<string, unknown>;
  additionalMounts?: AdditionalMount[];
}

export interface GroupsConfig {
  groups: Record<string, GroupConfigEntry>;
}

/**
 * Load groups.json from the given config directory.
 */
export function loadGroupsConfig(configDir: string): GroupsConfig | null {
  const filePath = path.join(configDir, 'groups.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as GroupsConfig;
  } catch (err) {
    logger.error({ err, filePath }, 'Failed to load groups.json');
    return null;
  }
}

/**
 * Match configured groups to discovered chats and call registerFn
 * for each match. Skips groups that are already registered.
 * Returns the number of groups registered.
 */
export function autoRegisterGroups(
  config: GroupsConfig,
  channelType: string,
  discoveredChats: ChatInfo[],
  alreadyRegistered: Set<string>,
  registerFn: (jid: string, group: RegisteredGroup) => void,
): number {
  let registered = 0;

  const chatsByName = new Map<string, ChatInfo>();
  for (const chat of discoveredChats) {
    if (chat.name) {
      chatsByName.set(chat.name, chat);
    }
  }

  for (const [_key, entry] of Object.entries(config.groups)) {
    const channelName = entry.channels?.[channelType];
    if (!channelName) {
      logger.debug(
        { group: entry.name, channelType },
        'No channel mapping for group, skipping',
      );
      continue;
    }

    const chat = chatsByName.get(channelName);
    if (!chat) {
      logger.warn(
        { group: entry.name, channelName, channelType },
        'No discovered channel matches group config',
      );
      continue;
    }

    if (alreadyRegistered.has(chat.jid)) {
      logger.debug(
        { group: entry.name, jid: chat.jid },
        'Group already registered, skipping',
      );
      continue;
    }

    const isMain = entry.isMain === true;
    const group: RegisteredGroup = {
      name: entry.name,
      folder: entry.folder,
      trigger: DEFAULT_TRIGGER,
      added_at: new Date().toISOString(),
      requiresTrigger: !isMain,
      ...(isMain && { isMain: true }),
    };

    if (entry.additionalMounts && entry.additionalMounts.length > 0) {
      group.containerConfig = {
        additionalMounts: entry.additionalMounts,
      };
    }

    registerFn(chat.jid, group);
    registered++;
    logger.info(
      { group: entry.name, jid: chat.jid, channelName, isMain },
      'Auto-registered group from config',
    );
  }

  return registered;
}
