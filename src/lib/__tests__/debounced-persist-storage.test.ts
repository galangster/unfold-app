import type { StateStorage } from 'zustand/middleware';
import { createJSONStorage } from 'zustand/middleware';
import {
  createDebouncedJSONStorage,
  STORE_PERSIST_DEBOUNCE_MS,
  STORE_PERSIST_MAX_WAIT_MS,
} from '../debounced-persist-storage';

type Stored = { count: number; label?: string };

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
  return { inner, data };
}

const value = (state: Stored, version = 38) => ({ state, version });

describe('createDebouncedJSONStorage (WR-23)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('coalesces a burst of writes into one serialization of the last value', () => {
    const { inner, data } = makeInner();
    const storage = createDebouncedJSONStorage<Stored>(inner);

    storage.setItem('k', value({ count: 1 }));
    storage.setItem('k', value({ count: 2 }));
    storage.setItem('k', value({ count: 3 }));

    expect(inner.setItem).not.toHaveBeenCalled();

    jest.advanceTimersByTime(STORE_PERSIST_DEBOUNCE_MS);

    expect(inner.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(data.get('k')!)).toEqual(value({ count: 3 }));
  });

  it('max-wait bounds a sustained write stream', () => {
    const { inner } = makeInner();
    const storage = createDebouncedJSONStorage<Stored>(inner);

    // Keep writing every 500ms — trailing debounce alone would never fire.
    for (let i = 0; i < 7; i++) {
      storage.setItem('k', value({ count: i }));
      jest.advanceTimersByTime(500);
    }

    // 3.5s elapsed with maxWait 3s → at least one forced write happened.
    expect(inner.setItem).toHaveBeenCalled();
    expect(
      (inner.setItem as jest.Mock).mock.calls.length,
    ).toBeLessThanOrEqual(2);
  });

  it('flushPendingWrites writes immediately and clears pending state', () => {
    const { inner, data } = makeInner();
    const storage = createDebouncedJSONStorage<Stored>(inner);

    storage.setItem('k', value({ count: 9 }));
    expect(storage.hasPendingWrites()).toBe(true);

    expect(storage.flushPendingWrites()).toBe(true);
    expect(storage.hasPendingWrites()).toBe(false);
    expect(JSON.parse(data.get('k')!)).toEqual(value({ count: 9 }));

    // Nothing further scheduled.
    (inner.setItem as jest.Mock).mockClear();
    jest.advanceTimersByTime(STORE_PERSIST_MAX_WAIT_MS * 2);
    expect(inner.setItem).not.toHaveBeenCalled();
    expect(storage.flushPendingWrites()).toBe(false);
  });

  it('flushPendingWritesAsync waits for the concrete storage write', async () => {
    let resolveWrite: (() => void) | undefined;
    const inner: StateStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(() => new Promise<void>((resolve) => { resolveWrite = resolve; })),
      removeItem: jest.fn(),
    };
    const storage = createDebouncedJSONStorage<Stored>(inner);

    storage.setItem('k', value({ count: 11 }));
    let settled = false;
    const flushed = storage.flushPendingWritesAsync().then((result) => {
      settled = true;
      return result;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    expect(storage.hasPendingWrites()).toBe(false);

    resolveWrite?.();
    await expect(flushed).resolves.toBe(true);
    expect(settled).toBe(true);
  });

  it('joins a write already started by a synchronous flush', async () => {
    let resolveWrite: (() => void) | undefined;
    const inner: StateStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(() => new Promise<void>((resolve) => { resolveWrite = resolve; })),
      removeItem: jest.fn(),
    };
    const storage = createDebouncedJSONStorage<Stored>(inner);

    storage.setItem('k', value({ count: 21 }));
    expect(storage.flushPendingWrites()).toBe(true);

    let joined = false;
    const flush = storage.flushPendingWritesAsync().then((result) => {
      joined = true;
      return result;
    });
    await Promise.resolve();
    expect(joined).toBe(false);

    resolveWrite?.();
    await expect(flush).resolves.toBe(true);
    expect(joined).toBe(true);
  });

  it('orders consecutive writes and waits for the latest value', async () => {
    const resolvers: (() => void)[] = [];
    const inner: StateStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(() => new Promise<void>((resolve) => { resolvers.push(resolve); })),
      removeItem: jest.fn(),
    };
    const storage = createDebouncedJSONStorage<Stored>(inner);

    storage.setItem('k', value({ count: 31 }));
    const first = storage.flushPendingWritesAsync();
    storage.setItem('k', value({ count: 32 }));
    const second = storage.flushPendingWritesAsync();

    expect(inner.setItem).toHaveBeenCalledTimes(1);
    resolvers[0]();
    await first;
    await Promise.resolve();
    expect(inner.setItem).toHaveBeenCalledTimes(2);

    resolvers[1]();
    await expect(second).resolves.toBe(true);
    expect(JSON.parse((inner.setItem as jest.Mock).mock.calls[1][1])).toEqual(value({ count: 32 }));
  });

  it('flushPendingWritesAsync reports a concrete storage failure', async () => {
    const inner: StateStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(() => Promise.reject(new Error('write failed'))),
      removeItem: jest.fn(),
    };
    const storage = createDebouncedJSONStorage<Stored>(inner);

    storage.setItem('k', value({ count: 12 }));

    await expect(storage.flushPendingWritesAsync()).rejects.toThrow('write failed');
  });

  it('allows a later full-state write after an earlier failure', async () => {
    const inner: StateStorage = {
      getItem: jest.fn(() => null),
      setItem: jest
        .fn()
        .mockRejectedValueOnce(new Error('first write failed'))
        .mockResolvedValueOnce(undefined),
      removeItem: jest.fn(),
    };
    const storage = createDebouncedJSONStorage<Stored>(inner);

    storage.setItem('k', value({ count: 41 }));
    await expect(storage.flushPendingWritesAsync()).rejects.toThrow('first write failed');

    storage.setItem('k', value({ count: 42 }));
    await expect(storage.flushPendingWritesAsync()).resolves.toBe(true);
    expect(inner.setItem).toHaveBeenCalledTimes(2);
  });

  it('orders removal after an in-flight write so deleted data cannot return', async () => {
    let resolveWrite: (() => void) | undefined;
    const inner: StateStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(() => new Promise<void>((resolve) => { resolveWrite = resolve; })),
      removeItem: jest.fn(),
    };
    const storage = createDebouncedJSONStorage<Stored>(inner);

    storage.setItem('k', value({ count: 51 }));
    storage.flushPendingWrites();
    storage.removeItem('k');

    expect(inner.removeItem).not.toHaveBeenCalled();
    resolveWrite?.();
    await expect(storage.flushPendingWritesAsync()).resolves.toBe(true);
    expect(inner.removeItem).toHaveBeenCalledWith('k');
    expect((inner.setItem as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (inner.removeItem as jest.Mock).mock.invocationCallOrder[0],
    );
  });

  it('orders a new write after an in-flight removal', async () => {
    let resolveRemoval: (() => void) | undefined;
    const inner: StateStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(() => new Promise<void>((resolve) => { resolveRemoval = resolve; })),
    };
    const storage = createDebouncedJSONStorage<Stored>(inner);

    storage.removeItem('k');
    storage.setItem('k', value({ count: 52 }));
    const flushed = storage.flushPendingWritesAsync();

    expect(inner.setItem).not.toHaveBeenCalled();
    resolveRemoval?.();
    await expect(flushed).resolves.toBe(true);
    expect(inner.setItem).toHaveBeenCalledTimes(1);
    expect((inner.removeItem as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (inner.setItem as jest.Mock).mock.invocationCallOrder[0],
    );
  });

  it('getItem serves the pending value inside the debounce window', () => {
    const { inner } = makeInner();
    const storage = createDebouncedJSONStorage<Stored>(inner);

    storage.setItem('k', value({ count: 5 }));
    expect(storage.getItem('k')).toEqual(value({ count: 5 }));
    expect(inner.getItem).not.toHaveBeenCalled();
  });

  it('round-trips through the same wire format as createJSONStorage', async () => {
    const { inner, data } = makeInner();
    const storage = createDebouncedJSONStorage<Stored>(inner);

    storage.setItem('k', value({ count: 4, label: 'wire' }));
    storage.flushPendingWrites();

    const reference = createJSONStorage<Stored>(() => inner)!;
    await expect(
      Promise.resolve(reference.getItem('k')),
    ).resolves.toEqual(value({ count: 4, label: 'wire' }));

    // And our getItem parses what createJSONStorage wrote.
    data.set('j', JSON.stringify(value({ count: 7 })));
    reference.setItem('j', value({ count: 7 }));
    expect(storage.getItem('j')).toEqual(value({ count: 7 }));
  });

  it('removeItem cancels a pending write and forwards the removal', () => {
    const { inner } = makeInner();
    const storage = createDebouncedJSONStorage<Stored>(inner);

    storage.setItem('k', value({ count: 1 }));
    storage.removeItem('k');

    expect(storage.hasPendingWrites()).toBe(false);
    expect(inner.removeItem).toHaveBeenCalledWith('k');

    jest.advanceTimersByTime(STORE_PERSIST_MAX_WAIT_MS * 2);
    expect(inner.setItem).not.toHaveBeenCalled();
  });

  it('returns null for missing keys', () => {
    const { inner } = makeInner();
    const storage = createDebouncedJSONStorage<Stored>(inner);
    expect(storage.getItem('missing')).toBeNull();
  });
});
