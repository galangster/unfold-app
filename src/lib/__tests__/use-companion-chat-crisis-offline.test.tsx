/**
 * A Companion reply that fails on the device, in a conversation that names
 * suicide, self-harm or abuse, still gives the reader the crisis lines. The
 * server adds them to any reply it sends; this covers the replies it never
 * gets to send.
 */
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

type MockUser = {
  name: string;
  hasCompletedOnboarding: boolean;
  companionPersonality?: string;
};

const mockUnfoldState: {
  user: MockUser | null;
  companionName: null;
  currentDevotionalId: string | null;
  devotionals: unknown[];
  streakCurrent: number;
} = {
  user: { name: 'Nick', hasCompletedOnboarding: true, companionPersonality: undefined },
  companionName: null,
  currentDevotionalId: null,
  devotionals: [],
  streakCurrent: 0,
};

jest.mock('../store', () => {
  const useUnfoldStore = (selector: (state: typeof mockUnfoldState) => unknown) => selector(mockUnfoldState);
  useUnfoldStore.getState = () => mockUnfoldState;
  return { useUnfoldStore };
});

jest.mock('../companion-service', () => ({
  generateConversationTitle: jest.fn(async () => null),
}));

import { useCompanionChat } from '../use-companion-chat';
import { useCompanionChatStore } from '../companion-chat-store';

const completedMockUser = (): MockUser => ({
  name: 'Nick',
  hasCompletedOnboarding: true,
  companionPersonality: undefined,
});

beforeEach(() => {
  mockUnfoldState.user = completedMockUser();
  mockFetch.mockReset();
  act(() => {
    useCompanionChatStore.getState().clearAllConversations();
  });
});

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

function HookHarness({ onReady }: { onReady: (hook: ReturnType<typeof useCompanionChat>) => void }) {
  const hook = useCompanionChat();
  onReady(hook);
  return null;
}

/** Mounts the hook and returns a getter for its latest render. */
async function renderHook() {
  let hook!: ReturnType<typeof useCompanionChat>;
  await act(async () => {
    createTestRenderer(<HookHarness onReady={(next) => { hook = next; }} />);
    await Promise.resolve();
  });
  return () => hook;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const lastReply = () => {
  const messages = useCompanionChatStore.getState().conversations[0]?.messages ?? [];
  return [...messages].reverse().find((m) => m.role === 'companion');
};

async function send(hook: () => ReturnType<typeof useCompanionChat>, text: string) {
  let outcome!: string;
  await act(async () => {
    outcome = await hook().sendMessage(text);
    await wait(50);
  });
  return outcome;
}

describe('crisis lines when a Companion reply fails on the device', () => {
  it('answers a crisis message with the crisis reply when the request never reaches the server', async () => {
    mockFetch.mockRejectedValue(new Error('Network request failed'));
    const hook = await renderHook();

    const outcome = await send(hook, 'I feel suicidal tonight');

    const reply = lastReply();
    expect(outcome).toBe('sent');
    expect(reply?.status).toBe('complete');
    expect(reply?.content).toMatch(/\b988\b/);
    expect(reply?.content).toContain('741741');
    expect(reply?.suggestions ?? []).toEqual([]);
    expect(hook().error).toBeNull();
  });

  it('gives the abuse hotline in the crisis reply', async () => {
    mockFetch.mockRejectedValue(new Error('Network request failed'));
    const hook = await renderHook();

    await send(hook, 'My husband hits me when he drinks');

    expect(lastReply()?.content).toContain('1-800-799-7233');
  });

  it('adds the crisis lines under a partial reply cut off by the connection', async () => {
    mockFetch.mockResolvedValueOnce(streamThatDropsAfter(['data: {"t":"I hear you."}\n\n']) as any);
    const hook = await renderHook();

    const outcome = await send(hook, 'I keep thinking about killing myself');

    const reply = lastReply();
    expect(outcome).toBe('sent');
    expect(reply?.status).toBe('error');
    expect(reply?.interrupted).toBe(true);
    expect(reply?.content?.startsWith('I hear you.')).toBe(true);
    expect(reply?.content).toMatch(/\b988\b/);
    expect(reply?.content).toContain('741741');
  });

  it('answers with the crisis reply when an earlier message in the conversation named a crisis', async () => {
    mockFetch.mockResolvedValueOnce(streamingResponseFromChunks([
      'data: {"t":"Please call or text 988, or text HOME to 741741."}\n\n',
      'data: {"d":true,"s":[]}\n\n',
    ]));
    const hook = await renderHook();
    await send(hook, 'I feel suicidal');

    mockFetch.mockRejectedValue(new Error('Network request failed'));
    const outcome = await send(hook, 'what do I say when I call');

    expect(outcome).toBe('sent');
    expect(lastReply()?.status).toBe('complete');
    expect(lastReply()?.content).toContain('741741');
  });

  it('answers with the crisis reply when the server sends an error frame', async () => {
    mockFetch.mockResolvedValueOnce(streamingResponseFromChunks(['data: {"error":"Something went wrong"}\n\n']));
    const hook = await renderHook();

    const outcome = await send(hook, 'I want to end my own life');

    expect(outcome).toBe('sent');
    expect(lastReply()?.status).toBe('complete');
    expect(lastReply()?.content).toContain('741741');
  });

  it('keeps the ordinary error for a conversation without crisis words', async () => {
    mockFetch.mockRejectedValue(new Error('Network request failed'));
    const hook = await renderHook();

    const outcome = await send(hook, 'What does Psalm 23 mean?');

    expect(outcome).toBe('error');
    expect(lastReply()?.status).toBe('error');
    expect(lastReply()?.content ?? '').not.toContain('988');
  });
});
