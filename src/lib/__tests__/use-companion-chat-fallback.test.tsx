import React from 'react';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

jest.mock('expo/fetch', () => ({
  fetch: (...args: Parameters<typeof fetch>) => mockFetch(...args),
}));

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://api.example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
  sanitizeForPrompt: (value: string) => value,
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
      }),
    },
    getDeviceId: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    __clearMockStorage: () => store.clear(),
  };
});

const mockUnfoldState = {
  user: { name: 'Nick' },
  companionName: null,
  currentDevotionalId: null,
  devotionals: [],
  streakCurrent: 0,
};

jest.mock('../store', () => ({
  useUnfoldStore: (selector: (state: typeof mockUnfoldState) => unknown) => selector(mockUnfoldState),
}));

jest.mock('../companion-service', () => ({
  generateConversationTitle: jest.fn(async () => null),
}));

import { useCompanionChat } from '../use-companion-chat';
import { useCompanionChatStore } from '../companion-chat-store';

function streamingResponseWithoutDone() {
  const reader = {
    read: jest.fn(async () => ({ done: true, value: undefined })),
    releaseLock: jest.fn(),
  };

  return {
    ok: true,
    body: {
      getReader: () => reader,
    },
  };
}

function streamingResponseFromChunks(chunks: string[]) {
  const encoder = new TextEncoder();
  const reader = {
    read: jest.fn(async () => {
      const chunk = chunks.shift();
      if (chunk === undefined) {
        return { done: true, value: undefined };
      }
      return { done: false, value: encoder.encode(chunk) };
    }),
    releaseLock: jest.fn(),
  };

  return {
    ok: true,
    body: {
      getReader: () => reader,
    },
  };
}

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload,
  };
}

function HookHarness({ onReady }: { onReady: (hook: ReturnType<typeof useCompanionChat>) => void }) {
  const hook = useCompanionChat();
  onReady(hook);
  return null;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('useCompanionChat fallback streaming', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    act(() => {
      useCompanionChatStore.getState().clearAllConversations();
    });
  });

  it('keeps the final non-streaming fallback text after delayed progressive-reveal updates fire', async () => {
    const fullResponse =
      'Here is the complete study-series answer with a finished ending that should remain visible.';

    mockFetch
      .mockResolvedValueOnce(streamingResponseWithoutDone())
      .mockResolvedValueOnce(jsonResponse({
        content: fullResponse,
        suggestions: ['Start the study'],
      }));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      renderer.create(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    await act(async () => {
      await hook!.sendMessage('Can you make this a longer study series?');
    });

    let companion = useCompanionChatStore
      .getState()
      .conversations[0]
      .messages.find((message) => message.role === 'companion');

    expect(companion).toMatchObject({
      status: 'complete',
      content: fullResponse,
      suggestions: ['Start the study'],
    });

    await act(async () => {
      await wait(150);
    });

    companion = useCompanionChatStore
      .getState()
      .conversations[0]
      .messages.find((message) => message.role === 'companion');

    expect(companion).toMatchObject({
      status: 'complete',
      content: fullResponse,
      suggestions: ['Start the study'],
    });
  });

  it('uses Expo fetch streaming without the legacy React Native textStreaming option', async () => {
    mockFetch.mockResolvedValueOnce(streamingResponseFromChunks([
      'data: {"t":"Hel',
      'lo"}\n\n',
      'data: {"t":" world"}\r\n\r\n',
      'data: {"d":true,"s":["Keep going"]}\n\n',
    ]));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      renderer.create(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    await act(async () => {
      await hook!.sendMessage('Stream this with Expo fetch');
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.test/api/companion/chat');
    expect(mockFetch.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ Accept: 'text/event-stream' }),
    });
    expect(mockFetch.mock.calls[0][1]).not.toHaveProperty('reactNative');

    const companion = useCompanionChatStore
      .getState()
      .conversations[0]
      .messages.find((message) => message.role === 'companion');

    expect(companion).toMatchObject({
      status: 'complete',
      content: 'Hello world',
      suggestions: ['Keep going'],
    });
  });
});
