/* eslint-disable import/first */
const mockEnqueuePersonalDataSyncChange = jest.fn();

jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://backend.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('@/lib/device-credential');

jest.mock('../personal-data-sync-records', () => {
  const actual = jest.requireActual('../personal-data-sync-records') as typeof import('../personal-data-sync-records');
  return {
    ...actual,
    enqueuePersonalDataSyncChange: (...args: unknown[]) => mockEnqueuePersonalDataSyncChange(...args),
  };
});

import type { CompanionMessage, Conversation } from '../companion-chat-store';
import {
  enqueueCompanionHydrationCorrections,
  reconcileUnfinishedCompanionReplies,
  useCompanionChatStore,
} from '../companion-chat-store';
import { companionConversationSyncData } from '../personal-data-sync-records';

function userMessage(id: string, content: string): CompanionMessage {
  return { id, role: 'user', content, timestamp: 1, status: 'sent' };
}

function conversation(id: string, messages: CompanionMessage[], extras: Partial<Conversation> = {}): Conversation {
  return {
    id,
    messages,
    createdAt: 1,
    lastMessageAt: 1,
    title: id,
    topicTags: [],
    archived: true,
    ...extras,
  };
}

describe('companion chat retention and pairing', () => {
  beforeEach(() => {
    mockEnqueuePersonalDataSyncChange.mockClear();
    useCompanionChatStore.setState({
      conversations: [],
      activeConversationId: null,
    });
  });

  it('keeps more than 50 conversations and 200 messages without silent deletes', () => {
    const conversations = Array.from({ length: 55 }, (_, index) => {
      const messages = Array.from({ length: index === 0 ? 210 : 1 }, (__, messageIndex) =>
        userMessage(`${index}-${messageIndex}`, `row ${messageIndex}`),
      );
      return conversation(`c-${index}`, messages, { lastMessageAt: index });
    });

    useCompanionChatStore.setState({
      conversations,
      activeConversationId: 'c-0',
    });
    useCompanionChatStore.getState().addMessage(userMessage('extra', 'kept'));
    useCompanionChatStore.getState().startNewConversation();

    const state = useCompanionChatStore.getState();
    expect(state.conversations).toHaveLength(56);
    expect(state.conversations.find((item) => item.id === 'c-0')?.messages).toHaveLength(211);
    expect(mockEnqueuePersonalDataSyncChange.mock.calls.some((call) => call[4] === true)).toBe(false);
  });

  it('creates a real conversation when the active id is stale', () => {
    useCompanionChatStore.setState({
      conversations: [],
      activeConversationId: 'deleted-elsewhere',
    });
    useCompanionChatStore.getState().addMessage(userMessage('u1', 'Still send this'));

    const state = useCompanionChatStore.getState();
    expect(state.conversations).toHaveLength(1);
    expect(state.activeConversationId).toBe(state.conversations[0].id);
    expect(state.conversations[0].messages[0].content).toBe('Still send this');
  });

  it('does not upload a streaming placeholder as a durable message', () => {
    useCompanionChatStore.setState({
      conversations: [conversation('c1', [userMessage('u1', 'Hi')], { archived: false })],
      activeConversationId: 'c1',
    });
    mockEnqueuePersonalDataSyncChange.mockClear();

    useCompanionChatStore.getState().addMessage({
      id: 'stream-1',
      role: 'companion',
      content: '',
      timestamp: 2,
      status: 'streaming',
    });

    const messageEnqueues = mockEnqueuePersonalDataSyncChange.mock.calls.filter((call) => call[0] === 'companion_messages');
    expect(messageEnqueues).toHaveLength(0);
    expect(useCompanionChatStore.getState().conversations[0].messages).toHaveLength(2);
  });

  it('pairs feedback with the nearest preceding user message', async () => {
    const { authenticatedFetch } = require('@/lib/device-credential') as { authenticatedFetch: jest.Mock };
    authenticatedFetch.mockClear();

    useCompanionChatStore.setState({
      conversations: [conversation('c1', [
        userMessage('u1', 'Older question'),
        { id: 'c-old', role: 'companion', content: 'Older reply', timestamp: 2, status: 'complete' },
        userMessage('u2', 'Latest question'),
        { id: 'c-new', role: 'companion', content: 'Latest reply', timestamp: 4, status: 'complete' },
      ], { archived: false })],
      activeConversationId: 'c1',
    });

    useCompanionChatStore.getState().setFeedback('c-old', 'negative', 'too-long');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const body = JSON.parse(authenticatedFetch.mock.calls[0][1].body as string);
    expect(body.userMessage).toBe('Older question');
  });
});

describe('companion hydration corrections', () => {
  it('converts unfinished replies to interrupted errors and enqueues terminal corrections', () => {
    mockEnqueuePersonalDataSyncChange.mockClear();
    const reconciled = reconcileUnfinishedCompanionReplies([
      conversation('c1', [
        userMessage('u1', 'Question'),
        { id: 'partial', role: 'companion', content: 'The next faithful step', timestamp: 2, status: 'streaming' },
      ]),
    ]);

    expect(reconciled.conversations[0].messages[1]).toMatchObject({
      id: 'partial',
      status: 'error',
      interrupted: true,
      content: 'The next faithful step',
    });

    enqueueCompanionHydrationCorrections(reconciled.corrections);
    expect(mockEnqueuePersonalDataSyncChange).toHaveBeenCalledWith(
      'companion_messages',
      'partial',
      expect.objectContaining({
        status: 'error',
        interrupted: true,
        content: 'The next faithful step',
      }),
      expect.any(String),
    );
  });
});

describe('companion conversation sync contract', () => {
  it('writes startedAt from createdAt and pinned as a boolean', () => {
    const data = companionConversationSyncData(conversation('c1', [], {
      createdAt: Date.parse('2026-01-15T08:00:00.000Z'),
      pinned: true,
    }));
    expect(data.startedAt).toBe('2026-01-15T08:00:00.000Z');
    expect(data.pinned).toBe(true);
  });
});
