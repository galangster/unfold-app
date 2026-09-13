import React from 'react';
import { AppState } from 'react-native';

const renderer = require('react-test-renderer');
const { act } = renderer;

const testRenderers: Array<ReturnType<typeof renderer.create>> = [];
function createTestRenderer(element: React.ReactElement) {
  const tree = renderer.create(element);
  testRenderers.push(tree);
  return tree;
}

afterEach(async () => {
  await act(async () => {
    testRenderers.splice(0).forEach((tree) => tree.unmount());
  });
});

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
  user: { name: 'Nick', companionPersonality: undefined as string | undefined },
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

function heldOpenStream(firstChunk?: string) {
  const encoder = new TextEncoder();
  let firstRead = true;
  const reader = {
    read: jest.fn(() => {
      if (firstRead && firstChunk !== undefined) {
        firstRead = false;
        return Promise.resolve({ done: false, value: encoder.encode(firstChunk) });
      }
      return new Promise<never>(() => {});
    }),
    cancel: jest.fn(() => new Promise<void>(() => {})),
    releaseLock: jest.fn(),
  };

  return {
    response: { ok: true, body: { getReader: () => reader } },
    reader,
  };
}

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload,
  };
}

function streamingRejectedResponse(status = 406) {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    text: async () => '',
  };
}

function sentCompanionPayload(callIndex = 0) {
  const body = mockFetch.mock.calls[callIndex]?.[1]?.body;
  if (typeof body !== 'string') {
    throw new Error('Expected companion request body');
  }
  return JSON.parse(body) as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    conversationId?: string;
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
    mockUnfoldState.user.companionPersonality = undefined;
    act(() => {
      useCompanionChatStore.getState().clearAllConversations();
    });
  });

  it('uses a changed personality on the next reply in the same conversation', async () => {
    mockFetch.mockImplementation(async () => streamingResponseFromChunks([
      'data: {"t":"Hello."}\n\n',
      'data: {"d":true,"s":[]}\n\n',
    ]));
    let hook!: ReturnType<typeof useCompanionChat>;
    const onReady = (next: ReturnType<typeof useCompanionChat>) => { hook = next; };
    let tree!: ReturnType<typeof renderer.create>;
    await act(async () => { tree = createTestRenderer(<HookHarness onReady={onReady} />); });
    await act(async () => { await hook.sendMessage('First question'); });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).context.companionPersonality).toBe('gentle');
    mockUnfoldState.user.companionPersonality = 'encouraging';
    await act(async () => { tree.update(<HookHarness onReady={onReady} />); });
    await act(async () => { await hook.sendMessage('Next question'); });
    const lastRequest = mockFetch.mock.calls.at(-1);
    expect(JSON.parse(lastRequest[1].body).context.companionPersonality).toBe('encouraging');
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
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
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

  it('resolves "error" without retrying when fetch fails before a response', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let outcome!: string;
    await act(async () => {
      outcome = await hook!.sendMessage('hi');
    });

    expect(outcome).toBe('error');
    expect(mockFetch).toHaveBeenCalledTimes(1);
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
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let outcome!: string;
    await act(async () => {
      outcome = await hook!.sendMessage('Hello');
    });

    expect(outcome).toBe('sent');
  });

  it('ends request state on the done event without waiting for stream EOF or reader cancellation', async () => {
    const stream = heldOpenStream(
      'data: {"t":"Complete answer"}\n\ndata: {"d":true,"s":["Continue"]}\n\n',
    );
    mockFetch.mockResolvedValueOnce(stream.response as any);

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await hook!.sendMessage('Finish this answer');
    });

    expect(outcome).toBe('sent');
    expect(hook!.isStreaming).toBe(false);
    expect(stream.reader.cancel).toHaveBeenCalledTimes(1);
    expect(stream.reader.read).toHaveBeenCalledTimes(1);
    const reply = useCompanionChatStore.getState().conversations[0]
      ?.messages.find((message) => message.role === 'companion');
    expect(reply).toMatchObject({ status: 'complete', content: 'Complete answer' });
  });

  it('skips null and primitive SSE payloads before a valid done event', async () => {
    const stream = heldOpenStream(
      'data: null\n\ndata: 42\n\ndata: "ignored"\n\n' +
      'data: {"t":"Valid answer"}\n\ndata: {"d":true,"s":[]}\n\n',
    );
    mockFetch.mockResolvedValueOnce(stream.response as any);

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await hook!.sendMessage('Ignore invalid events');
    });

    expect(outcome).toBe('sent');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(stream.reader.cancel).toHaveBeenCalledTimes(1);
    const reply = useCompanionChatStore.getState().conversations[0]
      ?.messages.find((message) => message.role === 'companion');
    expect(reply).toMatchObject({ status: 'complete', content: 'Valid answer' });
  });

  it('aborts during auth without starting a later fetch', async () => {
    const { getAuthHeaders } = jest.requireMock('@/lib/api-config') as { getAuthHeaders: jest.Mock };
    let releaseAuth!: () => void;
    getAuthHeaders.mockImplementationOnce(() => new Promise((resolve) => {
      releaseAuth = () => resolve({ 'Content-Type': 'application/json' });
    }));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let pending!: Promise<unknown>;
    act(() => {
      pending = hook!.sendMessage('Cancel before auth finishes');
    });
    expect(hook!.isStreaming).toBe(true);

    let outcome: unknown;
    await act(async () => {
      hook!.stopGeneration();
      outcome = await pending;
    });

    expect(outcome).toBe('error');
    expect(hook!.isStreaming).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();

    releaseAuth();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends streamConversationId and includes the current user turn once', async () => {
    mockFetch.mockResolvedValueOnce(streamingResponseFromChunks([
      'data: {"t":"Hello"}\n\n',
      'data: {"d":true,"s":[]}\n\n',
    ]));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    await act(async () => {
      await hook!.sendMessage('How should I pray?');
    });

    const payload = sentCompanionPayload();
    const conversationId = useCompanionChatStore.getState().conversations[0]?.id;
    expect(payload.conversationId).toBe(conversationId);
    expect(payload.messages.filter((message) => message.role === 'user' && message.content === 'How should I pray?')).toHaveLength(1);
    expect(useCompanionChatStore.getState().conversations[0]?.messages.filter((message) => message.role === 'user')).toHaveLength(1);
  });

  it('keeps the request conversationId on the stream conversation after a switch during auth', async () => {
    const { getAuthHeaders } = jest.requireMock('@/lib/api-config') as { getAuthHeaders: jest.Mock };
    let releaseAuth!: () => void;
    getAuthHeaders.mockImplementationOnce(() => new Promise((resolve) => {
      releaseAuth = () => resolve({ 'Content-Type': 'application/json' });
    }));
    mockFetch.mockResolvedValueOnce(streamingResponseFromChunks([
      'data: {"t":"Hello"}\n\n',
      'data: {"d":true,"s":[]}\n\n',
    ]));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let send!: Promise<string>;
    await act(async () => {
      send = hook!.sendMessage('Stay on this thread');
      await wait(10);
    });
    const streamId = useCompanionChatStore.getState().conversations[0]?.id;
    act(() => {
      useCompanionChatStore.getState().startNewConversation();
    });
    await act(async () => {
      releaseAuth();
      await send;
    });

    expect(sentCompanionPayload().conversationId).toBe(streamId);
  });
});

describe('retry error replies in place', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    act(() => {
      useCompanionChatStore.getState().clearAllConversations();
    });
  });

  it('retries the latest failed reply in place without appending another user turn', async () => {
    mockFetch.mockResolvedValueOnce(streamingResponseFromChunks([
      'data: {"t":"Retried"}\n\n',
      'data: {"d":true,"s":[]}\n\n',
    ]));

    useCompanionChatStore.setState({
      activeConversationId: 'c1',
      conversations: [{
        id: 'c1',
        messages: [
          { id: 'u1', role: 'user', content: 'Question', timestamp: 1, status: 'sent' },
          { id: 'e1', role: 'companion', content: 'Failed', timestamp: 2, status: 'error' },
        ],
        createdAt: 1,
        lastMessageAt: Date.now(),
        title: 'Question',
        topicTags: [],
        archived: false,
      }],
    });

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let outcome!: string;
    await act(async () => {
      outcome = await hook!.regenerateReply({ companionId: 'e1' });
    });

    expect(outcome).toBe('sent');
    const messages = useCompanionChatStore.getState().conversations[0]?.messages ?? [];
    expect(messages.filter((message) => message.role === 'user')).toHaveLength(1);
    expect(messages.find((message) => message.id === 'e1')).toMatchObject({
      status: 'complete',
      content: 'Retried',
      interrupted: false,
    });
    expect(sentCompanionPayload().messages).toEqual([{ role: 'user', content: 'Question' }]);
  });

  it('retries an older failed reply without rewriting a later one or sending later exchanges', async () => {
    mockFetch.mockResolvedValueOnce(streamingResponseFromChunks([
      'data: {"t":"Older recovered"}\n\n',
      'data: {"d":true,"s":[]}\n\n',
    ]));

    useCompanionChatStore.setState({
      activeConversationId: 'c1',
      conversations: [{
        id: 'c1',
        messages: [
          { id: 'u1', role: 'user', content: 'Older question', timestamp: 1, status: 'sent' },
          { id: 'e1', role: 'companion', content: 'Failed', timestamp: 2, status: 'error' },
          { id: 'u2', role: 'user', content: 'Later question', timestamp: 3, status: 'sent' },
          { id: 'c2', role: 'companion', content: 'Later reply', timestamp: 4, status: 'complete' },
        ],
        createdAt: 1,
        lastMessageAt: Date.now(),
        title: 'Older question',
        topicTags: [],
        archived: false,
      }],
    });

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    await act(async () => {
      await hook!.regenerateReply({ companionId: 'e1' });
    });

    const messages = useCompanionChatStore.getState().conversations[0]?.messages ?? [];
    expect(messages.map((message) => message.id)).toEqual(['u1', 'e1', 'u2', 'c2']);
    expect(messages.find((message) => message.id === 'e1')?.content).toBe('Older recovered');
    expect(messages.find((message) => message.id === 'c2')?.content).toBe('Later reply');
    expect(sentCompanionPayload().messages.map((message) => message.content)).toEqual(['Older question']);
  });

  it('keeps the no-double-send gate while a retry is in flight', async () => {
    let release!: () => void;
    mockFetch.mockReturnValueOnce(new Promise((resolve) => {
      release = () => resolve(streamingResponseFromChunks([
        'data: {"t":"Later"}\n\n',
        'data: {"d":true,"s":[]}\n\n',
      ]) as never);
    }));

    useCompanionChatStore.setState({
      activeConversationId: 'c1',
      conversations: [{
        id: 'c1',
        messages: [
          { id: 'u1', role: 'user', content: 'Question', timestamp: 1, status: 'sent' },
          { id: 'e1', role: 'companion', content: 'Failed', timestamp: 2, status: 'error' },
        ],
        createdAt: 1,
        lastMessageAt: Date.now(),
        title: 'Question',
        topicTags: [],
        archived: false,
      }],
    });

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let first!: Promise<string>;
    act(() => {
      first = hook!.regenerateReply({ companionId: 'e1' });
    });
    expect(hook!.isStreaming).toBe(true);
    let second!: string;
    await act(async () => {
      second = await hook!.regenerateReply({ companionId: 'e1' });
    });
    expect(second).toBe('noop');
    release();
    await act(async () => { await first; });
    expect(hook!.isStreaming).toBe(false);
  });

  it('restores the original reply when regeneration stops before any text', async () => {
    const stream = heldOpenStream();
    mockFetch.mockResolvedValueOnce(stream.response as any);
    useCompanionChatStore.setState({
      activeConversationId: 'c1',
      conversations: [{
        id: 'c1',
        messages: [
          { id: 'u1', role: 'user', content: 'Question', timestamp: 1, status: 'sent' },
          { id: 'e1', role: 'companion', content: 'Original reply', timestamp: 2, status: 'complete' },
        ],
        createdAt: 1,
        lastMessageAt: Date.now(),
        title: 'Question',
        topicTags: [],
        archived: false,
      }],
    });

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let pending!: Promise<unknown>;
    await act(async () => {
      pending = hook!.regenerateReply({ companionId: 'e1' });
      await Promise.resolve();
      await Promise.resolve();
    });
    let outcome: unknown;
    await act(async () => {
      hook!.stopGeneration();
      outcome = await pending;
    });

    expect(outcome).toBe('error');
    const messages = useCompanionChatStore.getState().conversations[0]?.messages ?? [];
    expect(messages).toHaveLength(2);
    expect(messages.find((message) => message.id === 'e1')).toMatchObject({
      content: 'Original reply',
      status: 'complete',
      interrupted: false,
    });
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
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
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
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
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

  it('commits a full non-streaming response and ends request state without a synthetic reveal', async () => {
    const fullResponse =
      'Here is the complete study-series answer with a finished ending that should remain visible.';

    mockFetch
      .mockResolvedValueOnce(streamingRejectedResponse())
      .mockResolvedValueOnce(jsonResponse({
        content: fullResponse,
        suggestions: ['Start the study'],
      }));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    await act(async () => {
      await hook!.sendMessage('Can you make this a longer study series?');
    });

    const companion = useCompanionChatStore
      .getState()
      .conversations[0]
      .messages.find((message) => message.role === 'companion');

    expect(companion).toMatchObject({
      status: 'complete',
      content: fullResponse,
      suggestions: ['Start the study'],
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(hook!.isStreaming).toBe(false);
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
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
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
      const tree = createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
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
      const tree = createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
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


describe('active request cancellation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    act(() => {
      useCompanionChatStore.getState().clearAllConversations();
    });
  });

  it('removes an explicitly stopped empty pending reply without showing a failure row', async () => {
    const stream = heldOpenStream();
    mockFetch.mockResolvedValueOnce(stream.response as any);

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let pending!: Promise<unknown>;
    await act(async () => {
      pending = hook!.sendMessage('Stop this pending read');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hook!.isStreaming).toBe(true);

    let outcome: unknown;
    await act(async () => {
      hook!.stopGeneration();
      outcome = await pending;
    });

    expect(outcome).toBe('error');
    expect(hook!.isStreaming).toBe(false);
    expect(stream.reader.cancel).toHaveBeenCalledTimes(1);
    const messages = useCompanionChatStore.getState().conversations[0]?.messages ?? [];
    expect(messages.filter((message) => message.role === 'user')).toHaveLength(1);
    expect(messages.filter((message) => message.role === 'companion')).toHaveLength(0);
    expect(hook!.error).toBeNull();
  });

  it('keeps partial text retryable after an explicit Stop', async () => {
    const stream = heldOpenStream('data: {"t":"A partial reply"}\n\n');
    mockFetch.mockResolvedValueOnce(stream.response as any);

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let pending!: Promise<unknown>;
    await act(async () => {
      pending = hook!.sendMessage('Stop after text arrives');
      await wait(10);
    });

    let outcome: unknown;
    await act(async () => {
      hook!.stopGeneration();
      outcome = await pending;
    });

    expect(outcome).toBe('sent');
    const stoppedReply = useCompanionChatStore.getState().conversations[0]
      ?.messages.find((message) => message.role === 'companion');
    expect(stoppedReply).toMatchObject({
      content: 'A partial reply',
      status: 'error',
      interrupted: true,
    });

    mockFetch.mockResolvedValueOnce(streamingResponseFromChunks([
      'data: {"t":"A complete retry"}\n\n',
      'data: {"d":true,"s":[]}\n\n',
    ]));
    await act(async () => {
      outcome = await hook!.regenerateReply({ companionId: stoppedReply!.id });
    });

    expect(outcome).toBe('sent');
    const messages = useCompanionChatStore.getState().conversations[0]?.messages ?? [];
    expect(messages.filter((message) => message.role === 'user')).toHaveLength(1);
    expect(messages.find((message) => message.id === stoppedReply!.id)).toMatchObject({
      content: 'A complete retry',
      status: 'complete',
      interrupted: false,
    });
  });

  it('keeps a real failure as a retryable error row', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await hook!.sendMessage('Let the request fail');
    });

    expect(outcome).toBe('error');
    const reply = useCompanionChatStore.getState().conversations[0]
      ?.messages.find((message) => message.role === 'companion');
    expect(reply?.status).toBe('error');
    expect(reply?.content).toBeTruthy();
    expect(hook!.error).toBeTruthy();
  });

  it('settles a stop while the non-streaming response body remains pending', async () => {
    let releaseBody!: () => void;
    const json = jest.fn(() => new Promise((resolve) => {
      releaseBody = () => resolve({ content: 'Too late', suggestions: [] });
    }));
    mockFetch
      .mockResolvedValueOnce(streamingRejectedResponse())
      .mockResolvedValueOnce({ ok: true, json });

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let pending!: Promise<unknown>;
    await act(async () => {
      pending = hook!.sendMessage('Stop while reading JSON');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(json).toHaveBeenCalledTimes(1);
    expect(hook!.isStreaming).toBe(true);

    let outcome: unknown;
    await act(async () => {
      hook!.stopGeneration();
      outcome = await pending;
    });

    expect(outcome).toBe('error');
    expect(hook!.isStreaming).toBe(false);
    releaseBody();
    await act(async () => { await Promise.resolve(); });
    const reply = useCompanionChatStore.getState().conversations[0]
      ?.messages.find((message) => message.role === 'companion');
    expect(reply).toBeUndefined();
  });

  it('cancels the owned reader when a stream read fails', async () => {
    const reader = {
      read: jest.fn(() => Promise.reject(new Error('Reader failed'))),
      cancel: jest.fn(() => new Promise<void>(() => {})),
      releaseLock: jest.fn(),
    };
    mockFetch.mockResolvedValueOnce({ ok: true, body: { getReader: () => reader } });

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await hook!.sendMessage('Fail this read');
    });

    expect(outcome).toBe('error');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(hook!.isStreaming).toBe(false);
  });
});


describe('server error events never trigger the non-streaming fallback (P0-3)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    act(() => {
      useCompanionChatStore.getState().clearAllConversations();
    });
  });

  it('ends on a server error event without waiting for stream EOF or reader cancellation', async () => {
    const stream = heldOpenStream(
      'data: {"error":"The companion is over capacity right now."}\n\n',
    );
    mockFetch
      .mockResolvedValueOnce(stream.response as any)
      .mockResolvedValueOnce(jsonResponse({ content: 'Billed twice!', suggestions: [] }));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await hook!.sendMessage('question');
    });

    expect(outcome).toBe('error');
    expect(hook!.isStreaming).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(stream.reader.cancel).toHaveBeenCalledTimes(1);
    expect(stream.reader.read).toHaveBeenCalledTimes(1);
  });

  it('surfaces a server {error} event with no partial text as a retryable error without a second request', async () => {
    mockFetch
      .mockResolvedValueOnce(streamingResponseFromChunks([
        'data: {"error":"The companion is over capacity right now."}\n\n',
      ]))
      // A fallback would consume this; it must never be requested.
      .mockResolvedValueOnce(jsonResponse({ content: 'Billed twice!', suggestions: [] }));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await hook!.sendMessage('question');
      await wait(100);
    });

    expect(outcome).toBe('error');
    expect(mockFetch).toHaveBeenCalledTimes(1); // no duplicate billed request
    const reply = useCompanionChatStore.getState().conversations[0]
      ?.messages.find((m) => m.role === 'companion');
    expect(reply?.status).toBe('error');
    expect(reply?.content).toBe('The companion is over capacity right now.');
    expect(hook!.error).toBe('The companion is over capacity right now.');
  });

  it('keeps partial text when a server {error} event arrives mid-stream', async () => {
    mockFetch
      .mockResolvedValueOnce(streamingResponseFromChunks([
        'data: {"t":"Partial thought"}\n\n',
        'data: {"error":"Model overloaded"}\n\n',
      ]))
      .mockResolvedValueOnce(jsonResponse({ content: 'Rewound answer', suggestions: [] }));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await hook!.sendMessage('question');
      await wait(100);
    });

    expect(outcome).toBe('sent');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const reply = useCompanionChatStore.getState().conversations[0]
      ?.messages.find((m) => m.role === 'companion');
    expect(reply?.status).toBe('error');
    expect(reply?.interrupted).toBe(true);
    expect(reply?.content).toBe('Partial thought'); // never rewound
    expect(hook!.error).toMatch(/incomplete/i);
  });

  it('keeps a durable interruption marker when the stream ends without done', async () => {
    mockFetch
      .mockResolvedValueOnce(streamingResponseFromChunks([
        'data: {"t":"Half an answer"}\n\n',
        // stream closes cleanly with no `d` event
      ]))
      .mockResolvedValueOnce(jsonResponse({ content: 'Full rewound answer', suggestions: [] }));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await hook!.sendMessage('question');
      await wait(100);
    });

    expect(outcome).toBe('sent');
    expect(mockFetch).toHaveBeenCalledTimes(1); // no fallback re-request
    const reply = useCompanionChatStore.getState().conversations[0]
      ?.messages.find((m) => m.role === 'companion');
    expect(reply?.status).toBe('error');
    expect(reply?.interrupted).toBe(true);
    expect(reply?.content).toBe('Half an answer');
    expect(hook!.error).toMatch(/incomplete/i);
  });

  it('surfaces an accepted response without a reader and permits an explicit retry', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, body: undefined })
      .mockResolvedValueOnce(streamingResponseFromChunks([
        'data: {"t":"Retried answer"}\n\n',
        'data: {"d":true,"s":[]}\n\n',
      ]));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await hook!.sendMessage('question');
    });

    expect(outcome).toBe('error');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const failedReply = useCompanionChatStore.getState().conversations[0]
      ?.messages.find((m) => m.role === 'companion');
    expect(failedReply?.status).toBe('error');

    await act(async () => {
      outcome = await hook!.regenerateReply({ companionId: failedReply!.id });
    });

    expect(outcome).toBe('sent');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const messages = useCompanionChatStore.getState().conversations[0]?.messages ?? [];
    expect(messages.filter((message) => message.role === 'user')).toHaveLength(1);
    expect(messages.find((message) => message.id === failedReply!.id)).toMatchObject({
      status: 'complete',
      content: 'Retried answer',
    });
  });

  it('surfaces accepted EOF without done and never starts a fallback request', async () => {
    mockFetch
      .mockResolvedValueOnce(streamingResponseWithoutDone())
      .mockResolvedValueOnce(jsonResponse({ content: 'Duplicate answer', suggestions: [] }));

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await hook!.sendMessage('question');
    });

    expect(outcome).toBe('error');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const reply = useCompanionChatStore.getState().conversations[0]
      ?.messages.find((message) => message.role === 'companion');
    expect(reply?.status).toBe('error');
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
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
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
    expect(reply?.interrupted).toBe(true);
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
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
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

describe('foreground resume reconciliation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    act(() => {
      useCompanionChatStore.getState().clearAllConversations();
    });
  });

  it('marks a reply stuck in streaming as an interrupted error and keeps its partial text', async () => {
    // The jest preset mocks AppState.addEventListener as a jest.fn.
    const addEventListener = AppState.addEventListener as unknown as jest.Mock;
    const listenerCallsBefore = addEventListener.mock.calls.length;

    await act(async () => {
      createTestRenderer(<HookHarness onReady={() => {}} />);
      await Promise.resolve();
    });

    // The hook registers exactly one AppState 'change' listener on mount.
    const changeListeners = addEventListener.mock.calls
      .slice(listenerCallsBefore)
      .filter(([event]: [string]) => event === 'change')
      .map(([, listener]: [string, (status: string) => void]) => listener);
    expect(changeListeners).toHaveLength(1);

    // A reply that died mid-stream while the app was suspended.
    act(() => {
      const store = useCompanionChatStore.getState();
      store.addMessage({ id: 'user-1', role: 'user', content: 'Tell me about Elijah', timestamp: 1, status: 'sent' });
      store.addMessage({ id: 'companion-1', role: 'companion', content: 'Elijah heard a gentle whisper', timestamp: 2, status: 'streaming' });
    });

    act(() => {
      changeListeners[0]('active');
    });

    const reply = useCompanionChatStore
      .getState()
      .conversations[0]
      ?.messages.find((m) => m.id === 'companion-1');
    expect(reply).toMatchObject({
      status: 'error',
      interrupted: true,
      content: 'Elijah heard a gentle whisper',
    });
  });

  it('preserves a short suspension and aborts a request after the existing stall budget', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-13T12:00:00.000Z'));
    const stream = heldOpenStream();
    mockFetch.mockResolvedValueOnce(stream.response as any);
    const addEventListener = AppState.addEventListener as unknown as jest.Mock;
    const listenerCallsBefore = addEventListener.mock.calls.length;

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    try {
      await act(async () => {
        createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
        await Promise.resolve();
      });
      const changeListener = addEventListener.mock.calls
        .slice(listenerCallsBefore)
        .find(([event]: [string]) => event === 'change')?.[1] as (status: string) => void;

      let pending!: Promise<unknown>;
      await act(async () => {
        pending = hook!.sendMessage('Keep this alive briefly');
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(hook!.isStreaming).toBe(true);

      act(() => {
        changeListener('background');
        jest.setSystemTime(new Date('2026-09-13T12:00:29.999Z'));
        changeListener('active');
      });
      expect(hook!.isStreaming).toBe(true);
      expect(stream.reader.cancel).not.toHaveBeenCalled();

      let outcome: unknown;
      await act(async () => {
        jest.setSystemTime(new Date('2026-09-13T12:00:30.000Z'));
        changeListener('active');
        outcome = await pending;
      });

      expect(outcome).toBe('error');
      expect(hook!.isStreaming).toBe(false);
      expect(stream.reader.cancel).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('settles foreground expiry while a budget response body remains pending', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-13T12:00:00.000Z'));
    let releaseBody!: () => void;
    const text = jest.fn(() => new Promise<string>((resolve) => {
      releaseBody = () => resolve(JSON.stringify({
        error: { code: 'SPEND_CAP_REACHED', retryAfter: 60 },
      }));
    }));
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: { get: () => '60' },
      text,
    });
    const addEventListener = AppState.addEventListener as unknown as jest.Mock;
    const listenerCallsBefore = addEventListener.mock.calls.length;

    let hook: ReturnType<typeof useCompanionChat> | null = null;
    try {
      await act(async () => {
        createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
        await Promise.resolve();
      });
      const changeListener = addEventListener.mock.calls
        .slice(listenerCallsBefore)
        .find(([event]: [string]) => event === 'change')?.[1] as (status: string) => void;

      let pending!: Promise<unknown>;
      await act(async () => {
        pending = hook!.sendMessage('Wait on the budget body');
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(text).toHaveBeenCalledTimes(1);

      let outcome: unknown;
      await act(async () => {
        jest.setSystemTime(new Date('2026-09-13T12:00:30.000Z'));
        changeListener('active');
        outcome = await pending;
      });

      expect(outcome).toBe('error');
      expect(hook!.isStreaming).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      releaseBody();
      await act(async () => { await Promise.resolve(); });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('daily AI budget (429 SPEND_CAP_REACHED)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    act(() => {
      useCompanionChatStore.getState().clearAllConversations();
    });
  });

  function rateLimited(code: 'SPEND_CAP_REACHED' | 'RATE_LIMITED', retryAfter: number) {
    return {
      ok: false,
      status: 429,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'retry-after' ? String(retryAfter) : null),
      },
      text: async () =>
        JSON.stringify({
          error: {
            code,
            message: `Try again in ${retryAfter} seconds.`,
            retryAfter,
          },
        }),
    };
  }

  async function sendOnce(text: string) {
    let hook: ReturnType<typeof useCompanionChat> | null = null;
    await act(async () => {
      createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
      await Promise.resolve();
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await hook!.sendMessage(text);
      await wait(150);
    });

    const reply = useCompanionChatStore.getState().conversations[0]
      ?.messages.find((m) => m.role === 'companion');
    return { hook: hook!, outcome, reply };
  }

  it('shows the budget copy with the reset estimate and never retries through the non-streaming endpoint', async () => {
    mockFetch
      .mockResolvedValueOnce(rateLimited('SPEND_CAP_REACHED', 5400))
      // A fallback would consume this; a budget response must never request it.
      .mockResolvedValueOnce(jsonResponse({ content: 'Billed anyway', suggestions: [] }));

    const { hook, outcome, reply } = await sendOnce('question');

    expect(outcome).toBe('error');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(reply?.status).toBe('error');
    expect(reply?.content).toBe("You've used up your daily AI budget. It resets in about 2 hours.");
    expect(hook.error).toBe("You've used up your daily AI budget. It resets in about 2 hours.");
  });

  it('keeps the existing non-streaming fallback for an ordinary 429', async () => {
    mockFetch
      .mockResolvedValueOnce(rateLimited('RATE_LIMITED', 30))
      .mockResolvedValueOnce(jsonResponse({ content: 'Fallback answer', suggestions: [] }));

    const { outcome, reply } = await sendOnce('question');

    expect(outcome).toBe('sent');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(reply?.status).toBe('complete');
    expect(reply?.content).toBe('Fallback answer');
  });

  it('shows the budget copy when the non-streaming fallback is the request that hits the budget', async () => {
    mockFetch
      .mockResolvedValueOnce(streamingRejectedResponse())
      .mockResolvedValueOnce(rateLimited('SPEND_CAP_REACHED', 600));

    const { hook, outcome, reply } = await sendOnce('question');

    expect(outcome).toBe('error');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(reply?.status).toBe('error');
    expect(reply?.content).toBe("You've used up your daily AI budget. It resets in about 10 minutes.");
    expect(hook.error).toBe("You've used up your daily AI budget. It resets in about 10 minutes.");
  });
});
