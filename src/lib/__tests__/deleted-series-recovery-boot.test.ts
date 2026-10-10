/**
 * 2026-10-09 release 1.1.19 lane: a delete made during a storage-recovery
 * boot came back on the return to the real store. The delete clocks live in
 * the active store, which during recovery is the throwaway namespace, and a
 * normal boot carried only the outbox across. Once the tombstone synced, a
 * finished generation job landed the deleted series again.
 *
 * Each boot below re-reads the real storage module from the same fake disk.
 * The Keychain is down for a recovery boot and back for a normal boot.
 */
const mockDisk = new Map<string, Map<string, string>>();
const mockKeychain = { up: false };

jest.mock('react-native-get-random-values', () => ({}));

jest.mock('react-native-mmkv', () => ({
  MMKV: class {
    private data: Map<string, string>;
    constructor({ id }: { id: string }) {
      const existing = mockDisk.get(id);
      this.data = existing ?? new Map();
      if (!existing) mockDisk.set(id, this.data);
    }
    getString(key: string) { return this.data.get(key); }
    set(key: string, value: string) { this.data.set(key, String(value)); }
    delete(key: string) { this.data.delete(key); }
    contains(key: string) { return this.data.has(key); }
    getAllKeys() { return [...this.data.keys()]; }
    clearAll() { this.data.clear(); }
  },
}));

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'after-first-unlock',
  getItem: jest.fn(() => {
    if (!mockKeychain.up) throw new Error('Keychain unavailable');
    return 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  }),
  setItem: jest.fn(),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('uuid', () => ({ v4: jest.fn(() => '00000000-0000-4000-8000-000000000000') }));

jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
  logBugEvent: jest.fn(),
}));

jest.mock('../logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { Devotional, UserProfile } from '../store';

type BootedModules = {
  arc: typeof import('../initial-arc-result');
  outbox: typeof import('../sync-outbox');
  session: typeof import('../generation-session');
  storage: typeof import('../mmkv-storage');
  store: typeof import('../store');
};

function boot(keychainUp: boolean, run: (modules: BootedModules) => void): void {
  mockKeychain.up = keychainUp;
  jest.isolateModules(() => {
    run({
      /* eslint-disable @typescript-eslint/no-require-imports */
      storage: require('../mmkv-storage'),
      arc: require('../initial-arc-result'),
      outbox: require('../sync-outbox'),
      session: require('../generation-session'),
      store: require('../store'),
      /* eslint-enable @typescript-eslint/no-require-imports */
    });
  });
}

const series: Devotional = {
  id: 'series-deleted-in-recovery',
  title: 'Synthetic series',
  totalDays: 3,
  currentDay: 1,
  days: [],
  createdAt: '2026-10-08T08:00:00.000Z',
  seriesStartDate: '2026-10-08T08:00:00.000Z',
  updatedAt: '2026-10-08T08:00:00.000Z',
  generationMode: 'progressive',
  userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
};

const result = {
  devotionalId: series.id,
  seriesTitle: 'Synthetic series',
  totalDays: 3,
  devotionalDay: {
    dayNumber: 1,
    title: 'Synthetic day',
    scriptureReference: 'John 1:1',
    scriptureText: 'Synthetic scripture.',
    bodyText: 'Synthetic body.',
    quotableLine: 'Synthetic line.',
    isRead: false,
  },
};

const user = { name: '', devotionalLength: 3 } as unknown as UserProfile;

beforeEach(() => {
  mockDisk.clear();
  // The real store exists and is encrypted, so a boot without the Keychain
  // runs on the recovery namespace.
  mockDisk.set('unfold-storage-meta', new Map([['unfold-store-v2-mode', 'encrypted']]));
  mockDisk.set('unfold-store-v2', new Map());
});

describe('a series deleted during a storage-recovery boot', () => {
  it('stays deleted on the real store when its finished generation job lands', () => {
    boot(false, ({ outbox, storage, store }) => {
      expect(storage.isRecoverySession()).toBe(true);
      store.useUnfoldStore.setState({ devotionals: [series], currentDevotionalId: series.id });
      store.useUnfoldStore.getState().removeDevotional(series.id);
      // The server accepted the delete, so the outbox no longer holds it.
      outbox.replaceSyncOutbox([]);
      store.flushUnfoldStorePersist();
    });

    // The Keychain is still down on the next launch.
    boot(false, ({ storage }) => {
      expect(storage.isRecoverySession()).toBe(true);
    });

    boot(true, ({ arc, session, storage, store }) => {
      expect(storage.isRecoverySession()).toBe(false);
      expect(() => arc.applyInitialArcResult(result, {
        user,
        devotionalLength: 3,
        session: session.captureSyncSession(),
      })).toThrow(arc.DeletedSeriesResultError);
      expect(store.useUnfoldStore.getState().devotionals.some((row) => row.id === series.id)).toBe(false);
    });
  });
});
