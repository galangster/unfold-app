import type { StateStorage, StorageValue } from 'zustand/middleware';
import {
  STORE_PERSIST_DEBOUNCE_MS,
  STORE_PERSIST_MAX_WAIT_MS,
  type DebouncedPersistStorage,
} from './debounced-persist-storage';

const FORMAT = 'companion-chat-shards-v1';
export const COMPANION_CHAT_STORAGE_KEY = 'unfold-companion-chat';
export const COMPANION_CHAT_SHARD_PREFIX = `${COMPANION_CHAT_STORAGE_KEY}:conversation:`;

type ConversationRecord = { id: string };

type CompanionChatState<C extends ConversationRecord> = {
  conversations: C[];
  activeConversationId: string | null;
};

type ShardManifest = {
  format: typeof FORMAT;
  version?: number;
  activeConversationId: string | null;
  conversationIds: string[];
  deletedConversationIds?: string[];
};

type PendingWrite<C extends ConversationRecord> = {
  name: string;
  revision: number;
  value: StorageValue<CompanionChatState<C>>;
};

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  value !== null && typeof value === 'object' && typeof (value as PromiseLike<unknown>).then === 'function';

const shardKey = (id: string) => `${COMPANION_CHAT_SHARD_PREFIX}${encodeURIComponent(id)}`;

function parseManifest(raw: string): ShardManifest | null {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || (parsed as { format?: unknown }).format !== FORMAT) {
    return null;
  }
  const manifest = parsed as Partial<ShardManifest>;
  if (!Array.isArray(manifest.conversationIds)) {
    throw new Error('invalid companion chat shard manifest');
  }
  if (manifest.deletedConversationIds !== undefined && !Array.isArray(manifest.deletedConversationIds)) {
    throw new Error('invalid companion chat shard manifest');
  }
  return manifest as ShardManifest;
}

/**
 * Persists companion conversations as separate MMKV values. Normal message
 * updates serialize one conversation plus the ID-only manifest, regardless of
 * the size of older history.
 */
export function createCompanionChatPersistStorage<C extends ConversationRecord>(
  inner: StateStorage,
  {
    debounceMs = STORE_PERSIST_DEBOUNCE_MS,
    maxWaitMs = STORE_PERSIST_MAX_WAIT_MS,
  }: { debounceMs?: number; maxWaitMs?: number } = {},
): DebouncedPersistStorage<CompanionChatState<C>> {
  let pending: PendingWrite<C> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlightOperation: Promise<void> | null = null;
  let revision = 0;
  let committed = new Map<string, C>();
  const knownShardIds = new Set<string>();
  let readable: { name: string; value: StorageValue<CompanionChatState<C>> } | null = null;

  const schedule = (fn: () => void, ms: number) => {
    const timer = setTimeout(fn, ms);
    (timer as unknown as { unref?: () => void }).unref?.();
    return timer;
  };

  const clearTimers = () => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    if (maxWaitTimer !== null) clearTimeout(maxWaitTimer);
    debounceTimer = null;
    maxWaitTimer = null;
  };

  const restoreFailedWrite = (write: PendingWrite<C>) => {
    if (write.revision === revision && pending === null) pending = write;
  };

  const runOperations = (
    operations: (() => unknown | Promise<unknown>)[],
    startIndex = 0,
  ): Promise<void> | null => {
    for (let index = startIndex; index < operations.length; index += 1) {
      const result = operations[index]();
      if (isPromiseLike(result)) {
        return Promise.resolve(result).then(() => runOperations(operations, index + 1) ?? undefined);
      }
    }
    return null;
  };

  const persistWrite = (write: PendingWrite<C>): Promise<void> | null => {
    const state = write.value.state;
    const next = new Map(state.conversations.map((conversation) => [conversation.id, conversation]));
    const changed = state.conversations.filter((conversation) => committed.get(conversation.id) !== conversation);
    const deletedIds = [...knownShardIds].filter((id) => !next.has(id));
    changed.forEach((conversation) => knownShardIds.add(conversation.id));
    const manifest: ShardManifest = {
      format: FORMAT,
      version: write.value.version,
      activeConversationId: state.activeConversationId,
      conversationIds: state.conversations.map((conversation) => conversation.id),
      deletedConversationIds: deletedIds.length > 0 ? deletedIds : undefined,
    };
    const operations: (() => unknown | Promise<unknown>)[] = [
      ...changed.map((conversation) => () => inner.setItem(shardKey(conversation.id), JSON.stringify(conversation))),
      () => inner.setItem(write.name, JSON.stringify(manifest)),
      ...deletedIds.map((id) => () => inner.removeItem(shardKey(id))),
    ];

    const commit = () => {
      committed = next;
      deletedIds.forEach((id) => knownShardIds.delete(id));
    };

    try {
      const result = runOperations(operations);
      if (result) {
        return result.then(commit, (error) => {
          restoreFailedWrite(write);
          throw error;
        });
      }
      commit();
      return null;
    } catch (error) {
      restoreFailedWrite(write);
      throw error;
    }
  };

  const trackOperation = (operation: Promise<void>): Promise<void> => {
    const tracked = operation.finally(() => {
      if (inFlightOperation === tracked) inFlightOperation = null;
    });
    void tracked.catch(() => {});
    inFlightOperation = tracked;
    return tracked;
  };

  const startWrite = (write: PendingWrite<C>): Promise<void> | null => {
    if (inFlightOperation) {
      const operation = inFlightOperation
        .catch(() => {})
        .then(() => persistWrite(write))
        .then(() => {});
      return trackOperation(operation);
    }
    const operation = persistWrite(write);
    return operation ? trackOperation(operation) : null;
  };

  const takePending = (): PendingWrite<C> | null => {
    if (!pending) return null;
    const write = pending;
    pending = null;
    clearTimers();
    return write;
  };

  const writeNow = (): boolean => {
    const write = takePending();
    if (!write) return false;
    startWrite(write);
    return true;
  };

  const writeNowSafely = () => {
    try {
      writeNow();
    } catch {
      // Keep the restored pending value for the next store update or explicit flush.
    }
  };

  const parseStoredValue = (
    raw: string | null,
  ): StorageValue<CompanionChatState<C>> | Promise<StorageValue<CompanionChatState<C>> | null> | null => {
    if (raw === null) return null;
    const manifest = parseManifest(raw);
    if (!manifest) return JSON.parse(raw) as StorageValue<CompanionChatState<C>>;

    const assemble = (shards: (string | null)[]) => {
      const conversations = shards.map((shard, index) => {
        if (shard === null) {
          throw new Error(`missing companion chat shard: ${manifest.conversationIds[index]}`);
        }
        return JSON.parse(shard) as C;
      });
      committed = new Map(conversations.map((conversation) => [conversation.id, conversation]));
      conversations.forEach((conversation) => knownShardIds.add(conversation.id));
      const value: StorageValue<CompanionChatState<C>> = {
        state: {
          conversations,
          activeConversationId: manifest.activeConversationId,
        },
        version: manifest.version,
      };
      const deletedIds = (manifest.deletedConversationIds ?? []).filter((id) => !committed.has(id));
      deletedIds.forEach((id) => knownShardIds.add(id));
      const finishCleanup = () => {
        deletedIds.forEach((id) => knownShardIds.delete(id));
        return value;
      };
      try {
        const cleanup = runOperations(deletedIds.map((id) => () => inner.removeItem(shardKey(id))));
        return cleanup ? cleanup.then(finishCleanup, () => value) : finishCleanup();
      } catch {
        // Cleanup can retry on the next write. Valid history must still load.
        return value;
      }
    };

    const shards = manifest.conversationIds.map((id) => inner.getItem(shardKey(id)));
    if (shards.some(isPromiseLike)) {
      return Promise.all(shards.map((shard) => Promise.resolve(shard))).then(assemble);
    }
    return assemble(shards as (string | null)[]);
  };

  return {
    getItem: (name) => {
      if (readable?.name === name) return readable.value;
      const raw = inner.getItem(name);
      if (isPromiseLike(raw)) return Promise.resolve(raw).then(parseStoredValue);
      return parseStoredValue(raw);
    },

    setItem: (name, value) => {
      revision += 1;
      pending = { name, value, revision };
      readable = { name, value };
      if (maxWaitTimer === null) maxWaitTimer = schedule(writeNowSafely, maxWaitMs);
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = schedule(writeNowSafely, debounceMs);
    },

    removeItem: (name) => {
      revision += 1;
      if (pending?.name === name) {
        pending = null;
        clearTimers();
      }
      readable = null;
      const removePersistedState = (): Promise<void> | null => {
        const operations = [
          () => inner.removeItem(name),
          ...[...knownShardIds].map((id) => () => inner.removeItem(shardKey(id))),
        ];
        const clearTracking = () => {
          committed = new Map();
          knownShardIds.clear();
        };
        const operation = runOperations(operations);
        if (operation) return operation.then(clearTracking);
        clearTracking();
        return null;
      };
      if (inFlightOperation !== null) {
        trackOperation(inFlightOperation.catch(() => {}).then(removePersistedState).then(() => {}));
      } else {
        const operation = removePersistedState();
        if (operation) trackOperation(operation);
      }
    },
    flushPendingWrites: writeNow,
    flushPendingWritesAsync: async () => {
      const write = takePending();
      if (write) {
        await startWrite(write);
        return true;
      }
      if (inFlightOperation === null) return false;
      await inFlightOperation;
      return true;
    },
    hasPendingWrites: () => pending !== null,
  };
}
