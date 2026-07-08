import React from 'react';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

jest.mock('expo/fetch', () => ({
  fetch: (...args: Parameters<typeof fetch>) => mockFetch(...args),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://api.example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
  sanitizeForPrompt: (value: string, maxLength = 2000) => value.slice(0, maxLength),
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

function sentCompanionPayload() {
  const body = mockFetch.mock.calls[0]?.[1]?.body;
  if (typeof body !== 'string') {
    throw new Error('Expected companion request body');
  }
  return JSON.parse(body) as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  };
}

function HookHarness({ onReady }: { onReady: (hook: ReturnType<typeof useCompanionChat>) => void }) {
  const hook = useCompanionChat();
  onReady(hook);
  return null;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('sendMessage outcome', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    act(() => {
      useCompanionChatStore.getState().clearAllConversations();
    });
  });

  it('resolves "noop" when called while streaming', async () => {
    // A fetch that never resolves — keeps the hook in streaming state
    let resolveFirst!: () => void;
    mockFetch
      .mockReturnValueOnce(
        new Promise<never>((res) => { resolveFirst = () => res(streamingResponseWithoutDone() as any); }),
      )
      .mockResolvedValue(streamingResponseWithoutDone());

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      renderer.create(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    // Start a send (streaming begins, never resolves)
    let firstSend!: ReturnType<typeof useCompanionChat>['sendMessage'] extends (...a: any[]) => infer R ? R : never;
    act(() => { firstSend = hook!.sendMessage('first message'); });

    // While streaming, call sendMessage again — should return 'noop'
    let secondOutcome!: string;
    await act(async () => {
      secondOutcome = await hook!.sendMessage('again');
    });

    expect(secondOutcome).toBe('noop');
    expect(mockFetch).toHaveBeenCalledTimes(1); // only one real fetch

    // Resolve the first send to clean up
    resolveFirst();
    await act(async () => { await firstSend; });
  });

  it('resolves "error" when stream and fallback both fail', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      renderer.create(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let outcome!: string;
    await act(async () => {
      outcome = await hook!.sendMessage('hi');
    });

    expect(outcome).toBe('error');
    const companion = useCompanionChatStore
      .getState()
      .conversations[0]
      ?.messages.find((m) => m.role === 'companion');
    expect(companion?.status).toBe('error');
  });

  it('resolves "sent" on a successful exchange', async () => {
    mockFetch.mockResolvedValueOnce(streamingResponseFromChunks([
      'data: {"t":"Hello"}\n\n',
      'data: {"d":true,"s":[]}\n\n',
    ]));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      renderer.create(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let outcome!: string;
    await act(async () => {
      outcome = await hook!.sendMessage('Hello');
    });

    expect(outcome).toBe('sent');
  });
});

describe('useCompanionChat prompt payload length', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    act(() => {
      useCompanionChatStore.getState().clearAllConversations();
    });
  });

  it('sends a 2001-4000 character current message without the default prompt clip', async () => {
    const message = 'a'.repeat(3500);
    mockFetch.mockResolvedValueOnce(streamingResponseFromChunks([
      'data: {"t":"I hear you."}\n\n',
      'data: {"d":true,"s":[]}\n\n',
    ]));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      renderer.create(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    await act(async () => {
      await hook!.sendMessage(message);
    });

    const payload = sentCompanionPayload();
    const currentMessage = payload.messages[payload.messages.length - 1];
    expect(currentMessage).toMatchObject({
      role: 'user',
      content: message,
    });
    expect(currentMessage.content).toHaveLength(3500);
  });

  it('caps the direct current-message payload at 4000 instead of the default prompt clip', async () => {
    const maxLength = 4000;
    const message = 'b'.repeat(maxLength + 1);
    mockFetch.mockResolvedValueOnce(streamingResponseFromChunks([
      'data: {"t":"I hear you."}\n\n',
      'data: {"d":true,"s":[]}\n\n',
    ]));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      renderer.create(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    await act(async () => {
      await hook!.sendMessage(message);
    });

    const payload = sentCompanionPayload();
    const currentMessage = payload.messages[payload.messages.length - 1];
    expect(currentMessage).toMatchObject({
      role: 'user',
      content: message.slice(0, maxLength),
    });
    expect(currentMessage.content).toHaveLength(maxLength);
  });
});

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


describe('conversation-scoped streaming (WR-09)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    act(() => {
      useCompanionChatStore.getState().clearAllConversations();
    });
  });

  function deferredStream(chunks: string[]) {
    let releaseNext!: () => void;
    const gate = new Promise<void>((resolve) => { releaseNext = resolve; });
    const encoder = new TextEncoder();
    const queue = [...chunks];
    const reader = {
      read: jest.fn(async () => {
        const chunk = queue.shift();
        if (chunk === undefined) return { done: true, value: undefined };
        if (queue.length === 0) {
          // Hold the final chunk until the test releases it.
          await gate;
        }
        return { done: false, value: encoder.encode(chunk) };
      }),
      releaseLock: jest.fn(),
    };
    return {
      response: { ok: true, body: { getReader: () => reader } },
      release: () => releaseNext(),
    };
  }

  it('lands the reply in its own conversation after a mid-stream switch and unblocks the new one', async () => {
    const stream = deferredStream([
      'data: {"t":"The answer"}\n\n',
      'data: {"d":true,"s":[]}\n\n',
    ]);
    mockFetch
      .mockResolvedValueOnce(stream.response as any)
      .mockResolvedValueOnce(streamingResponseFromChunks([
        'data: {"t":"Second answer"}\n\n',
        'data: {"d":true,"s":[]}\n\n',
      ]) as any);

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    let rerender: () => void = () => {};
    await act(async () => {
      const tree = renderer.create(<HookHarness onReady={(next) => { hook = next; }} />);
      rerender = () => tree.update(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let firstSend!: Promise<unknown>;
    await act(async () => {
      firstSend = hook!.sendMessage('first question');
      await wait(10);
    });
    const originalConversationId = useCompanionChatStore.getState().activeConversationId!;
    expect(hook!.isStreaming).toBe(true);

    // Switch to a new conversation mid-stream.
    act(() => {
      useCompanionChatStore.getState().startNewConversation();
    });
    act(() => { rerender(); });
    // (c) the streaming indicator reflects the now-active conversation
    expect(hook!.isStreaming).toBe(false);

    // (d) sending in the new conversation is allowed while the old streams
    let secondSend!: Promise<unknown>;
    await act(async () => {
      secondSend = hook!.sendMessage('second question');
      await wait(10);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Release the first stream and let both settle.
    await act(async () => {
      stream.release();
      await firstSend;
      await secondSend;
      await wait(10);
    });

    // (a) the original conversation received its full reply
    const conversations = useCompanionChatStore.getState().conversations;
    const original = conversations.find((c) => c.id === originalConversationId);
    const originalReply = (original?.messages ?? []).find((m) => m.role === 'companion');
    expect(originalReply?.status).toBe('complete');
    expect(originalReply?.content).toBe('The answer');

    // (b) the new conversation holds only its own exchange
    const active = conversations.find((c) => c.id === useCompanionChatStore.getState().activeConversationId);
    const activeReply = (active?.messages ?? []).find((m) => m.role === 'companion');
    expect(activeReply?.content).toBe('Second answer');
  });

  it('stopGeneration aborts the visible conversation, not a background stream', async () => {
    const stream = deferredStream([
      'data: {"t":"Background text"}\n\n',
      'data: {"d":true,"s":[]}\n\n',
    ]);
    mockFetch.mockResolvedValueOnce(stream.response as any);

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    let rerender: () => void = () => {};
    await act(async () => {
      const tree = renderer.create(<HookHarness onReady={(next) => { hook = next; }} />);
      rerender = () => tree.update(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let firstSend!: Promise<unknown>;
    await act(async () => {
      firstSend = hook!.sendMessage('background question');
      await wait(10);
    });
    const originalConversationId = useCompanionChatStore.getState().activeConversationId!;

    act(() => {
      useCompanionChatStore.getState().startNewConversation();
    });
    act(() => { rerender(); });

    // (e) Stop while viewing the new conversation must not abort the old stream.
    act(() => { hook!.stopGeneration(); });
    await act(async () => {
      stream.release();
      await firstSend;
      await wait(10);
    });

    const original = useCompanionChatStore.getState().conversations
      .find((c) => c.id === originalConversationId);
    const reply = (original?.messages ?? []).find((m) => m.role === 'companion');
    expect(reply?.status).toBe('complete');
    expect(reply?.content).toBe('Background text');
  });
});


describe('network-drop resilience (WR-11)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    act(() => {
      useCompanionChatStore.getState().clearAllConversations();
    });
  });

  function streamThatDropsAfter(chunks: string[]) {
    const encoder = new TextEncoder();
    const queue = [...chunks];
    const reader = {
      read: jest.fn(async () => {
        const chunk = queue.shift();
        if (chunk === undefined) throw new Error('Network request failed');
        return { done: false, value: encoder.encode(chunk) };
      }),
      releaseLock: jest.fn(),
    };
    return { ok: true, body: { getReader: () => reader } };
  }

  it('keeps the partial answer when the connection drops mid-stream', async () => {
    mockFetch
      .mockResolvedValueOnce(streamThatDropsAfter(['data: {"t":"Partial answer"}\n\n']) as any)
      .mockRejectedValueOnce(new Error('Network request failed'));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      renderer.create(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await hook!.sendMessage('question');
      await wait(400);
    });

    const conv = useCompanionChatStore.getState().conversations[0];
    const reply = (conv?.messages ?? []).find((m) => m.role === 'companion');
    expect(reply?.status).toBe('complete');
    expect(reply?.content).toBe('Partial answer');
    expect(outcome).toBe('sent');
    expect(hook!.error).toMatch(/incomplete/i);
    expect(hook!.error).not.toMatch(/Something went wrong/);
  });

  it('shows a connectivity-aware error when nothing streamed', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockRejectedValueOnce(new Error('Network request failed'));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      renderer.create(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await hook!.sendMessage('question');
      await wait(400);
    });

    const conv = useCompanionChatStore.getState().conversations[0];
    const reply = (conv?.messages ?? []).find((m) => m.role === 'companion');
    expect(reply?.status).toBe('error');
    expect(outcome).toBe('error');
    // Copy comes from analyzeNetworkError, not the old canned string.
    expect(reply?.content).not.toBe('Something went wrong. Tap to retry.');
    expect(reply?.content).toBeTruthy();
  });
});
