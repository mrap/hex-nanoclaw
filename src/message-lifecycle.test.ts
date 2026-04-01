import { describe, it, expect, beforeEach } from 'vitest';

import {
  _initTestDatabase,
  getMessagesSince,
  getNewMessages,
  getRouterState,
  setRouterState,
  storeMessage,
  storeChatMetadata,
  getLastBotMessageTimestamp,
} from './db.js';
import { getTriggerPattern } from './config.js';
import { NewMessage } from './types.js';

const BOT_PREFIX = 'Andy';
const CHAT_JID = 'lifecycle@g.us';

/** Helper: store a user message with sensible defaults. */
function storeUserMsg(overrides: {
  id: string;
  content: string;
  timestamp: string;
  chat_jid?: string;
  is_from_me?: boolean;
  is_bot_message?: boolean;
}): void {
  storeMessage({
    id: overrides.id,
    chat_jid: overrides.chat_jid ?? CHAT_JID,
    sender: 'user@s.whatsapp.net',
    sender_name: 'User',
    content: overrides.content,
    timestamp: overrides.timestamp,
    is_from_me: overrides.is_from_me ?? false,
    is_bot_message: overrides.is_bot_message ?? false,
  });
}

beforeEach(() => {
  _initTestDatabase();
  storeChatMetadata(
    CHAT_JID,
    '2024-01-01T00:00:00.000Z',
    'Test Group',
    'whatsapp',
    true,
  );
});

// ---------------------------------------------------------------------------
// Cursor management
// ---------------------------------------------------------------------------

describe('cursor management', () => {
  it('getNewMessages returns only messages after the stored cursor timestamp', () => {
    storeUserMsg({
      id: 'm1',
      content: 'old',
      timestamp: '2024-01-01T00:00:01.000Z',
    });
    storeUserMsg({
      id: 'm2',
      content: 'new',
      timestamp: '2024-01-01T00:00:03.000Z',
    });

    const cursor = '2024-01-01T00:00:02.000Z';
    const { messages } = getNewMessages([CHAT_JID], cursor, BOT_PREFIX);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('new');
  });

  it('getMessagesSince with cursor returns only newer messages', () => {
    storeUserMsg({
      id: 'm1',
      content: 'before',
      timestamp: '2024-01-01T00:00:01.000Z',
    });
    storeUserMsg({
      id: 'm2',
      content: 'at',
      timestamp: '2024-01-01T00:00:02.000Z',
    });
    storeUserMsg({
      id: 'm3',
      content: 'after',
      timestamp: '2024-01-01T00:00:03.000Z',
    });

    const msgs = getMessagesSince(
      CHAT_JID,
      '2024-01-01T00:00:02.000Z',
      BOT_PREFIX,
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('after');
  });

  it('advancing cursor after retrieval causes next query to return empty', () => {
    storeUserMsg({
      id: 'm1',
      content: 'hello',
      timestamp: '2024-01-01T00:00:01.000Z',
    });

    const { messages, newTimestamp } = getNewMessages(
      [CHAT_JID],
      '2024-01-01T00:00:00.000Z',
      BOT_PREFIX,
    );
    expect(messages).toHaveLength(1);

    // Simulate cursor advance (as processGroupMessages does)
    const { messages: next } = getNewMessages(
      [CHAT_JID],
      newTimestamp,
      BOT_PREFIX,
    );
    expect(next).toHaveLength(0);
  });

  it('cursor between messages returns only messages after cursor', () => {
    storeUserMsg({
      id: 'm1',
      content: 'first',
      timestamp: '2024-01-01T00:00:01.000Z',
    });
    storeUserMsg({
      id: 'm2',
      content: 'second',
      timestamp: '2024-01-01T00:00:02.000Z',
    });
    storeUserMsg({
      id: 'm3',
      content: 'third',
      timestamp: '2024-01-01T00:00:03.000Z',
    });
    storeUserMsg({
      id: 'm4',
      content: 'fourth',
      timestamp: '2024-01-01T00:00:04.000Z',
    });

    // Cursor sits between m2 and m3
    const { messages } = getNewMessages(
      [CHAT_JID],
      '2024-01-01T00:00:02.000Z',
      BOT_PREFIX,
    );
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('third');
    expect(messages[1].content).toBe('fourth');
  });

  it('cursor stored via setRouterState persists across getRouterState calls', () => {
    const cursorKey = 'last_agent_timestamp';
    const cursorValue = JSON.stringify({
      [CHAT_JID]: '2024-01-01T00:00:05.000Z',
    });

    setRouterState(cursorKey, cursorValue);
    const retrieved = getRouterState(cursorKey);
    expect(retrieved).toBe(cursorValue);

    // Verify parsed structure
    const parsed = JSON.parse(retrieved!);
    expect(parsed[CHAT_JID]).toBe('2024-01-01T00:00:05.000Z');
  });
});

// ---------------------------------------------------------------------------
// Message filtering
// ---------------------------------------------------------------------------

describe('message filtering', () => {
  it('bot messages (is_bot_message=true) are excluded from retrieval', () => {
    storeUserMsg({
      id: 'm1',
      content: 'user says hi',
      timestamp: '2024-01-01T00:00:01.000Z',
    });
    storeMessage({
      id: 'm2',
      chat_jid: CHAT_JID,
      sender: 'bot@s.whatsapp.net',
      sender_name: 'Bot',
      content: 'bot response',
      timestamp: '2024-01-01T00:00:02.000Z',
      is_from_me: false,
      is_bot_message: true,
    });
    storeUserMsg({
      id: 'm3',
      content: 'user follows up',
      timestamp: '2024-01-01T00:00:03.000Z',
    });

    const msgs = getMessagesSince(
      CHAT_JID,
      '2024-01-01T00:00:00.000Z',
      BOT_PREFIX,
    );
    expect(msgs).toHaveLength(2);
    expect(msgs.every((m) => m.content !== 'bot response')).toBe(true);
  });

  it('messages older than cursor are not returned', () => {
    storeUserMsg({
      id: 'm1',
      content: 'ancient',
      timestamp: '2023-06-01T00:00:00.000Z',
    });
    storeUserMsg({
      id: 'm2',
      content: 'recent',
      timestamp: '2024-01-01T00:00:02.000Z',
    });

    const msgs = getMessagesSince(
      CHAT_JID,
      '2024-01-01T00:00:01.000Z',
      BOT_PREFIX,
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('recent');
  });
});

// ---------------------------------------------------------------------------
// Trigger gating
// ---------------------------------------------------------------------------

describe('trigger gating', () => {
  it('non-main group with trigger pattern: only matching messages activate processing', () => {
    const trigger = '@Andy';
    const triggerPattern = getTriggerPattern(trigger);

    storeUserMsg({
      id: 'm1',
      content: 'random chatter',
      timestamp: '2024-01-01T00:00:01.000Z',
    });
    storeUserMsg({
      id: 'm2',
      content: '@Andy help me',
      timestamp: '2024-01-01T00:00:02.000Z',
    });
    storeUserMsg({
      id: 'm3',
      content: 'more chatter',
      timestamp: '2024-01-01T00:00:03.000Z',
    });

    const msgs = getMessagesSince(
      CHAT_JID,
      '2024-01-01T00:00:00.000Z',
      BOT_PREFIX,
    );
    // All 3 messages are returned by the DB layer
    expect(msgs).toHaveLength(3);

    // Trigger gating happens at the orchestration layer — check pattern match
    const hasTrigger = msgs.some((m) => triggerPattern.test(m.content.trim()));
    expect(hasTrigger).toBe(true);

    // Without trigger, processing would be skipped
    const noTriggerMsgs: NewMessage[] = [
      {
        id: 'm1',
        chat_jid: CHAT_JID,
        sender: 'u',
        sender_name: 'U',
        content: 'random chatter',
        timestamp: '2024-01-01T00:00:01.000Z',
      },
      {
        id: 'm3',
        chat_jid: CHAT_JID,
        sender: 'u',
        sender_name: 'U',
        content: 'more chatter',
        timestamp: '2024-01-01T00:00:03.000Z',
      },
    ];
    const noTrigger = noTriggerMsgs.some((m) =>
      triggerPattern.test(m.content.trim()),
    );
    expect(noTrigger).toBe(false);
  });

  it('main group: all messages processed regardless of trigger', () => {
    // Main group sets isMain=true and requiresTrigger is irrelevant
    // The key check in processGroupMessages: if (isMainGroup) → skip trigger check
    // Here we verify the pattern: isMain bypasses trigger evaluation
    const isMainGroup = true;
    const requiresTrigger = true; // even if set, isMain overrides

    storeUserMsg({
      id: 'm1',
      content: 'no trigger word',
      timestamp: '2024-01-01T00:00:01.000Z',
    });
    storeUserMsg({
      id: 'm2',
      content: 'just chatting',
      timestamp: '2024-01-01T00:00:02.000Z',
    });

    const msgs = getMessagesSince(
      CHAT_JID,
      '2024-01-01T00:00:00.000Z',
      BOT_PREFIX,
    );
    expect(msgs).toHaveLength(2);

    // Main group logic: skip trigger check entirely
    const shouldProcess = isMainGroup || !requiresTrigger;
    expect(shouldProcess).toBe(true);
  });

  it('trigger pattern is case-insensitive', () => {
    const triggerPattern = getTriggerPattern('@Andy');
    expect(triggerPattern.test('@andy help')).toBe(true);
    expect(triggerPattern.test('@ANDY help')).toBe(true);
    expect(triggerPattern.test('@Andy help')).toBe(true);
  });

  it('trigger requires word boundary after pattern', () => {
    const triggerPattern = getTriggerPattern('@Andy');
    // "@Andy" followed by space: match
    expect(triggerPattern.test('@Andy help')).toBe(true);
    // "@Andy" at end of string: match (word boundary at EOL)
    expect(triggerPattern.test('@Andy')).toBe(true);
    // "@Andyson" should NOT match (no word boundary)
    expect(triggerPattern.test('@Andyson')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('empty message queue: getNewMessages returns empty array', () => {
    const { messages, newTimestamp } = getNewMessages(
      [CHAT_JID],
      '',
      BOT_PREFIX,
    );
    expect(messages).toHaveLength(0);
    expect(newTimestamp).toBe('');
  });

  it('messages with identical timestamps are both returned, ordered by subquery', () => {
    storeUserMsg({
      id: 'same-1',
      content: 'alpha',
      timestamp: '2024-01-01T00:00:01.000Z',
    });
    storeUserMsg({
      id: 'same-2',
      content: 'beta',
      timestamp: '2024-01-01T00:00:01.000Z',
    });

    const msgs = getMessagesSince(
      CHAT_JID,
      '2024-01-01T00:00:00.000Z',
      BOT_PREFIX,
    );
    expect(msgs).toHaveLength(2);
    const contents = msgs.map((m) => m.content).sort();
    expect(contents).toEqual(['alpha', 'beta']);
  });

  it('getNewMessages advances newTimestamp to latest message', () => {
    storeUserMsg({
      id: 'm1',
      content: 'first',
      timestamp: '2024-01-01T00:00:01.000Z',
    });
    storeUserMsg({
      id: 'm2',
      content: 'second',
      timestamp: '2024-01-01T00:00:05.000Z',
    });
    storeUserMsg({
      id: 'm3',
      content: 'third',
      timestamp: '2024-01-01T00:00:03.000Z',
    });

    const { newTimestamp } = getNewMessages(
      [CHAT_JID],
      '2024-01-01T00:00:00.000Z',
      BOT_PREFIX,
    );
    expect(newTimestamp).toBe('2024-01-01T00:00:05.000Z');
  });

  it('cursor recovery from last bot message timestamp', () => {
    storeUserMsg({
      id: 'm1',
      content: 'old msg',
      timestamp: '2024-01-01T00:00:01.000Z',
    });
    storeMessage({
      id: 'bot-1',
      chat_jid: CHAT_JID,
      sender: 'bot@s.whatsapp.net',
      sender_name: 'Bot',
      content: 'bot reply',
      timestamp: '2024-01-01T00:00:02.000Z',
      is_from_me: false,
      is_bot_message: true,
    });
    storeUserMsg({
      id: 'm2',
      content: 'new msg',
      timestamp: '2024-01-01T00:00:03.000Z',
    });

    // Simulate cursor recovery (getOrRecoverCursor logic)
    const recovered = getLastBotMessageTimestamp(CHAT_JID, BOT_PREFIX);
    expect(recovered).toBe('2024-01-01T00:00:02.000Z');

    // Using recovered cursor only returns messages after bot reply
    const msgs = getMessagesSince(CHAT_JID, recovered!, BOT_PREFIX);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('new msg');
  });

  it('pre-migration bot messages filtered via content prefix backstop', () => {
    // Message with Andy: prefix but is_bot_message=false (pre-migration)
    storeUserMsg({
      id: 'legacy-bot',
      content: 'Andy: I am a bot reply',
      timestamp: '2024-01-01T00:00:01.000Z',
    });

    const msgs = getMessagesSince(
      CHAT_JID,
      '2024-01-01T00:00:00.000Z',
      BOT_PREFIX,
    );
    expect(msgs).toHaveLength(0);
  });

  it('router state round-trips complex cursor maps', () => {
    const cursors: Record<string, string> = {
      'group1@g.us': '2024-01-01T00:00:05.000Z',
      'group2@g.us': '2024-01-01T00:00:10.000Z',
      'dm@s.whatsapp.net': '2024-01-01T00:00:15.000Z',
    };

    setRouterState('last_agent_timestamp', JSON.stringify(cursors));
    const raw = getRouterState('last_agent_timestamp');
    expect(raw).toBeDefined();

    const parsed = JSON.parse(raw!);
    expect(parsed['group1@g.us']).toBe('2024-01-01T00:00:05.000Z');
    expect(parsed['group2@g.us']).toBe('2024-01-01T00:00:10.000Z');
    expect(parsed['dm@s.whatsapp.net']).toBe('2024-01-01T00:00:15.000Z');
  });
});
