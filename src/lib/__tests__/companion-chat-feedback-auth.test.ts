/* eslint-disable import/first */
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

jest.mock('../personal-data-sync-records', () => ({
  companionConversationSyncData: jest.fn(() => ({})),
  companionMessageSyncData: jest.fn(() => ({})),
  enqueuePersonalDataSyncChange: jest.fn(),
}));

import { authenticatedFetch } from '@/lib/device-credential';
import { useCompanionChatStore } from '../companion-chat-store';

describe('companion chat feedback request', () => {
  it('posts feedback through authenticatedFetch', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    (authenticatedFetch as jest.Mock).mockClear();

    useCompanionChatStore.setState({
      activeConversationId: 'c1',
      conversations: [{
        id: 'c1',
        messages: [{
          id: 'm1',
          role: 'companion',
          content: 'Hello',
          timestamp: 1,
          status: 'complete',
        }],
        createdAt: 1,
        lastMessageAt: 1,
        title: 'Hello',
        topicTags: [],
        archived: false,
      }],
    });

    useCompanionChatStore.getState().setFeedback('m1', 'positive');
    // The ping is fire-and-forget; let its header lookup settle.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(authenticatedFetch).toHaveBeenCalledWith(
      'https://backend.test/api/companion-feedback',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
