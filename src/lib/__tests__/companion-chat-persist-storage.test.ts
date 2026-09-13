import type { StateStorage, StorageValue } from 'zustand/middleware';
import {
  COMPANION_CHAT_SHARD_PREFIX,
  createCompanionChatPersistStorage,
} from '../companion-chat-persist-storage';

type TestConversation = {
  id: string;
  messages: { id: string; content: string }[];
};

type TestState = {
  conversations: TestConversation[];
  activeConversationId: string | null;
};

function makeInner() {
  const data = new Map<string, string>();
  const inner: StateStorage = {
    getItem: jest.fn((name: string) => data.get(name) ?? null),
    setItem: jest.fn((name: string, value: string) => {
      data.set(name, value);
    }),
    removeItem: jest.fn((name: string) => {
      data.delete(name);
    }),
  };
  return { data, inner };
}

const stored = (state: TestState, version = 5): StorageValue<TestState> => ({ state, version });
const conversation = (id: string, content = id): TestConversation => ({
  id,
  messages: [{ id: `message-${id}`, content }],
});

describe('companion chat sharded persistence', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('hydrates a legacy snapshot and migrates every conversation without pruning it', async () => {
    const { data, inner } = makeInner();
    const legacy = stored({
      conversations: [conversation('old-1'), conversation('old-2')],
      activeConversationId: 'old-2',
    }, 3);
    data.set('chat', JSON.stringify(legacy));
    const storage = createCompanionChatPersistStorage<TestConversation>(inner);

    await expect(Promise.resolve(storage.getItem('chat'))).resolves.toEqual(legacy);

    storage.setItem('chat', legacy);
    await expect(storage.flushPendingWritesAsync()).resolves.toBe(true);
    const restartedStorage = createCompanionChatPersistStorage<TestConversation>(inner);
    const hydrated = await Promise.resolve(restartedStorage.getItem('chat'));

    expect(hydrated).toEqual(legacy);
    expect([...data.keys()].filter((key) => key.startsWith(COMPANION_CHAT_SHARD_PREFIX))).toHaveLength(2);
  });

  it('serializes and writes only the changed conversation after the initial shard write', async () => {
    const { inner } = makeInner();
    const storage = createCompanionChatPersistStorage<TestConversation>(inner);
    const conversations = Array.from({ length: 1_000 }, (_, index) =>
      conversation(`c-${index}`, 'x'.repeat(2_000)),
    );
    storage.setItem('chat', stored({ conversations, activeConversationId: 'c-999' }));
    await storage.flushPendingWritesAsync();
    (inner.setItem as jest.Mock).mockClear();

    const changed = {
      ...conversations[999],
      messages: [{ id: 'message-c-999', content: 'changed' }],
    };
    const stringify = jest.spyOn(JSON, 'stringify');
    storage.setItem('chat', stored({
      conversations: [...conversations.slice(0, 999), changed],
      activeConversationId: 'c-999',
    }));
    await storage.flushPendingWritesAsync();

    expect(inner.setItem).toHaveBeenCalledTimes(2);
    expect(inner.setItem).toHaveBeenCalledWith(`${COMPANION_CHAT_SHARD_PREFIX}c-999`, expect.any(String));
    expect(stringify.mock.calls.some(([value]) => value === changed)).toBe(true);
    expect(stringify.mock.calls.some(([value]) => value === conversations[0])).toBe(false);
    stringify.mockRestore();

    const restartedStorage = createCompanionChatPersistStorage<TestConversation>(inner);
    const hydrated = await Promise.resolve(restartedStorage.getItem('chat'));
    expect(hydrated?.state.conversations).toHaveLength(1_000);
    expect(hydrated?.state.conversations[0]).toEqual(conversations[0]);
  });

  it('commits deletion in the manifest before removing the deleted shard', async () => {
    const { data, inner } = makeInner();
    const storage = createCompanionChatPersistStorage<TestConversation>(inner);
    const kept = conversation('kept');
    const deleted = conversation('deleted');
    storage.setItem('chat', stored({ conversations: [kept, deleted], activeConversationId: 'kept' }));
    await storage.flushPendingWritesAsync();
    (inner.setItem as jest.Mock).mockClear();
    (inner.removeItem as jest.Mock).mockClear();

    storage.setItem('chat', stored({ conversations: [kept], activeConversationId: 'kept' }));
    await storage.flushPendingWritesAsync();

    expect(data.has(`${COMPANION_CHAT_SHARD_PREFIX}deleted`)).toBe(false);
    expect(inner.setItem).toHaveBeenCalledTimes(1);
    expect(inner.removeItem).toHaveBeenCalledWith(`${COMPANION_CHAT_SHARD_PREFIX}deleted`);
    expect((inner.setItem as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (inner.removeItem as jest.Mock).mock.invocationCallOrder[0],
    );
  });

  it('removes every known shard when the whole store is explicitly cleared', async () => {
    const { data, inner } = makeInner();
    const storage = createCompanionChatPersistStorage<TestConversation>(inner);
    storage.setItem('chat', stored({
      conversations: [conversation('one'), conversation('two')],
      activeConversationId: 'two',
    }));
    await storage.flushPendingWritesAsync();

    storage.removeItem('chat');

    expect(data.has('chat')).toBe(false);
    expect([...data.keys()].filter((key) => key.startsWith(COMPANION_CHAT_SHARD_PREFIX))).toHaveLength(0);
  });

  it('finishes interrupted deleted-shard cleanup during hydration', async () => {
    const { data, inner } = makeInner();
    data.set('chat', JSON.stringify({
      format: 'companion-chat-shards-v1',
      version: 5,
      activeConversationId: 'kept',
      conversationIds: ['kept'],
      deletedConversationIds: ['deleted'],
    }));
    data.set(`${COMPANION_CHAT_SHARD_PREFIX}kept`, JSON.stringify(conversation('kept')));
    data.set(`${COMPANION_CHAT_SHARD_PREFIX}deleted`, JSON.stringify(conversation('deleted')));
    const storage = createCompanionChatPersistStorage<TestConversation>(inner);

    const hydrated = await Promise.resolve(storage.getItem('chat'));

    expect(hydrated?.state.conversations).toEqual([conversation('kept')]);
    expect(data.has(`${COMPANION_CHAT_SHARD_PREFIX}deleted`)).toBe(false);
  });

  it.each(['throw', 'reject'] as const)('loads valid history when cleanup fails by %s, then retries deletion', async (failure) => {
    const { data, inner } = makeInner();
    data.set('chat', JSON.stringify({
      format: 'companion-chat-shards-v1',
      version: 5,
      activeConversationId: 'kept',
      conversationIds: ['kept'],
      deletedConversationIds: ['deleted'],
    }));
    data.set(`${COMPANION_CHAT_SHARD_PREFIX}kept`, JSON.stringify(conversation('kept')));
    data.set(`${COMPANION_CHAT_SHARD_PREFIX}deleted`, JSON.stringify(conversation('deleted')));
    (inner.removeItem as jest.Mock).mockImplementation(() => {
      if (failure === 'reject') return Promise.reject(new Error('cleanup failed'));
      throw new Error('cleanup failed');
    });
    const storage = createCompanionChatPersistStorage<TestConversation>(inner);

    const hydrated = await storage.getItem('chat');

    expect(hydrated?.state.conversations).toEqual([conversation('kept')]);
    expect(data.has(`${COMPANION_CHAT_SHARD_PREFIX}deleted`)).toBe(true);
    (inner.removeItem as jest.Mock).mockImplementation((name: string) => { data.delete(name); });
    if (!hydrated) throw new Error('Expected saved history');
    storage.setItem('chat', hydrated);
    await storage.flushPendingWritesAsync();

    expect(data.has(`${COMPANION_CHAT_SHARD_PREFIX}deleted`)).toBe(false);
    expect(data.has(`${COMPANION_CHAT_SHARD_PREFIX}kept`)).toBe(true);
    const restartedStorage = createCompanionChatPersistStorage<TestConversation>(inner);
    await expect(Promise.resolve(restartedStorage.getItem('chat'))).resolves.toEqual(hydrated);
  });

  it('keeps a live conversation even if an old deletion marker names it', async () => {
    const { data, inner } = makeInner();
    data.set('chat', JSON.stringify({
      format: 'companion-chat-shards-v1',
      version: 5,
      activeConversationId: 'kept',
      conversationIds: ['kept'],
      deletedConversationIds: ['kept'],
    }));
    data.set(`${COMPANION_CHAT_SHARD_PREFIX}kept`, JSON.stringify(conversation('kept')));
    const storage = createCompanionChatPersistStorage<TestConversation>(inner);

    const hydrated = await storage.getItem('chat');

    expect(hydrated?.state.conversations).toEqual([conversation('kept')]);
    expect(inner.removeItem).not.toHaveBeenCalled();
    expect(data.has(`${COMPANION_CHAT_SHARD_PREFIX}kept`)).toBe(true);
  });

  it('clears shards written by a delayed flush before reset', async () => {
    const { data, inner } = makeInner();
    let finishShardWrite: (() => void) | undefined;
    (inner.setItem as jest.Mock).mockImplementation((name: string, value: string) => {
      data.set(name, value);
      if (name.startsWith(COMPANION_CHAT_SHARD_PREFIX)) {
        return new Promise<void>((resolve) => { finishShardWrite = resolve; });
      }
    });
    const storage = createCompanionChatPersistStorage<TestConversation>(inner);
    storage.setItem('chat', stored({ conversations: [conversation('delayed')], activeConversationId: 'delayed' }));

    expect(storage.flushPendingWrites()).toBe(true);
    storage.removeItem('chat');
    expect(inner.removeItem).not.toHaveBeenCalled();

    finishShardWrite?.();
    await storage.flushPendingWritesAsync();
    expect(data.has('chat')).toBe(false);
    expect(data.has(`${COMPANION_CHAT_SHARD_PREFIX}delayed`)).toBe(false);
  });

  it('clears attempted shards after a failed legacy migration', async () => {
    const { data, inner } = makeInner();
    const legacy = stored({ conversations: [conversation('attempted')], activeConversationId: 'attempted' });
    data.set('chat', JSON.stringify(legacy));
    (inner.setItem as jest.Mock).mockImplementation((name: string, value: string) => {
      if (name === 'chat') throw new Error('manifest failed');
      data.set(name, value);
    });
    const storage = createCompanionChatPersistStorage<TestConversation>(inner);
    await Promise.resolve(storage.getItem('chat'));
    storage.setItem('chat', legacy);
    await expect(storage.flushPendingWritesAsync()).rejects.toThrow('manifest failed');
    expect(data.has(`${COMPANION_CHAT_SHARD_PREFIX}attempted`)).toBe(true);

    storage.removeItem('chat');

    expect(data.has('chat')).toBe(false);
    expect(data.has(`${COMPANION_CHAT_SHARD_PREFIX}attempted`)).toBe(false);
  });

  it('persists a newer write queued after an in-flight reset', async () => {
    const { data, inner } = makeInner();
    let finishOldShard: (() => void) | undefined;
    (inner.setItem as jest.Mock).mockImplementation((name: string, value: string) => {
      data.set(name, value);
      if (name === `${COMPANION_CHAT_SHARD_PREFIX}old`) {
        return new Promise<void>((resolve) => { finishOldShard = resolve; });
      }
    });
    const storage = createCompanionChatPersistStorage<TestConversation>(inner);
    storage.setItem('chat', stored({ conversations: [conversation('old')], activeConversationId: 'old' }));
    storage.flushPendingWrites();

    storage.removeItem('chat');
    const newer = stored({ conversations: [conversation('new')], activeConversationId: 'new' });
    storage.setItem('chat', newer);
    storage.flushPendingWrites();
    finishOldShard?.();
    await storage.flushPendingWritesAsync();

    expect(data.has(`${COMPANION_CHAT_SHARD_PREFIX}old`)).toBe(false);
    const restartedStorage = createCompanionChatPersistStorage<TestConversation>(inner);
    await expect(Promise.resolve(restartedStorage.getItem('chat'))).resolves.toEqual(newer);
  });

  it('hydrates the pending state before the debounce window closes', async () => {
    const { inner } = makeInner();
    const storage = createCompanionChatPersistStorage<TestConversation>(inner);
    const pending = stored({ conversations: [conversation('pending')], activeConversationId: 'pending' });

    storage.setItem('chat', pending);

    await expect(Promise.resolve(storage.getItem('chat'))).resolves.toBe(pending);
    expect(inner.getItem).not.toHaveBeenCalled();
  });

  it('keeps the legacy snapshot recoverable when migration fails, then retries', async () => {
    const { data, inner } = makeInner();
    const legacy = stored({ conversations: [conversation('recover')], activeConversationId: 'recover' });
    const legacyJSON = JSON.stringify(legacy);
    data.set('chat', legacyJSON);
    let failManifest = true;
    (inner.setItem as jest.Mock).mockImplementation((name: string, value: string) => {
      if (failManifest && name === 'chat') {
        throw new Error('disk full');
      }
      data.set(name, value);
    });
    const storage = createCompanionChatPersistStorage<TestConversation>(inner);
    await Promise.resolve(storage.getItem('chat'));

    storage.setItem('chat', legacy);
    await expect(storage.flushPendingWritesAsync()).rejects.toThrow('disk full');
    expect(data.get('chat')).toBe(legacyJSON);
    expect(storage.hasPendingWrites()).toBe(true);
    expect(data.has(`${COMPANION_CHAT_SHARD_PREFIX}recover`)).toBe(true);

    failManifest = false;
    await expect(storage.flushPendingWritesAsync()).resolves.toBe(true);
    const restartedStorage = createCompanionChatPersistStorage<TestConversation>(inner);
    await expect(Promise.resolve(restartedStorage.getItem('chat'))).resolves.toEqual(legacy);
  });

  it('rejects incomplete shard hydration without deleting recoverable data', async () => {
    const { data, inner } = makeInner();
    data.set('chat', JSON.stringify({
      format: 'companion-chat-shards-v1',
      version: 5,
      activeConversationId: 'missing',
      conversationIds: ['missing'],
    }));
    const storage = createCompanionChatPersistStorage<TestConversation>(inner);

    expect(() => storage.getItem('chat')).toThrow('missing companion chat shard');
    expect(inner.removeItem).not.toHaveBeenCalled();
    expect(data.has('chat')).toBe(true);
  });

  it('retains debounce and max-wait behavior for streaming updates', async () => {
    const { inner } = makeInner();
    const storage = createCompanionChatPersistStorage<TestConversation>(inner, {
      debounceMs: 1_000,
      maxWaitMs: 3_000,
    });
    const first = conversation('stream', 'first');

    storage.setItem('chat', stored({ conversations: [first], activeConversationId: 'stream' }));
    jest.advanceTimersByTime(500);
    storage.setItem('chat', stored({
      conversations: [{ ...first, messages: [{ id: 'message-stream', content: 'second' }] }],
      activeConversationId: 'stream',
    }));
    expect(inner.setItem).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1_000);
    expect(inner.setItem).toHaveBeenCalledTimes(2);

    (inner.setItem as jest.Mock).mockClear();
    for (let index = 0; index < 7; index += 1) {
      storage.setItem('chat', stored({
        conversations: [conversation('stream', String(index))],
        activeConversationId: 'stream',
      }));
      jest.advanceTimersByTime(500);
    }
    expect(inner.setItem).toHaveBeenCalled();
    await storage.flushPendingWritesAsync();
  });
});
