/* eslint-disable import/first */
/**
 * 2026-10-09 release 1.1.19 lane: a series deleted here came back after a
 * restart. The delete clocks lived only in memory. Once the delete synced, the
 * outbox no longer held its tombstone, and after a restart the finished
 * generation job landed the deleted series again. A restart re-reads the
 * modules below from the same device storage.
 */
const mockMmkvItems = new Map<string, string>();

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

jest.mock('../mmkv-storage', () => ({
  mmkvStorage: {
    getItem: jest.fn((key: string) => mockMmkvItems.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      mockMmkvItems.set(key, value);
    }),
    removeItem: jest.fn((key: string) => {
      mockMmkvItems.delete(key);
    }),
  },
  getDeviceId: jest.fn(() => 'test-device-id'),
  getSharedEncryptionKey: jest.fn(() => 'test-key'),
  isRecoverySession: jest.fn(() => false),
}));

import { rememberDeletedSeries, resetDeletedSeriesForTesting } from '../deleted-series';
import { flushUnfoldStorePersist, useUnfoldStore, type Devotional, type UserProfile } from '../store';
import { replaceSyncOutbox } from '../sync-outbox';

type RestartedModules = {
  arc: typeof import('../initial-arc-result');
  deleted: typeof import('../deleted-series');
  session: typeof import('../generation-session');
  store: typeof import('../store');
};

function afterRestart(run: (modules: RestartedModules) => void): void {
  jest.isolateModules(() => {
    run({
      /* eslint-disable @typescript-eslint/no-require-imports */
      arc: require('../initial-arc-result'),
      deleted: require('../deleted-series'),
      session: require('../generation-session'),
      store: require('../store'),
      /* eslint-enable @typescript-eslint/no-require-imports */
    });
  });
}

const series: Devotional = {
  id: 'series-deleted',
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
  devotionalId: 'series-deleted',
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
  mockMmkvItems.clear();
  resetDeletedSeriesForTesting();
  replaceSyncOutbox([]);
  useUnfoldStore.getState().reset();
});

describe('a series deleted here, after its delete synced and the app restarted', () => {
  it('stays deleted when its finished generation job lands', () => {
    useUnfoldStore.setState({ devotionals: [series], currentDevotionalId: series.id });
    useUnfoldStore.getState().removeDevotional(series.id);
    // The server accepted the delete, so the outbox no longer holds it.
    replaceSyncOutbox([]);
    flushUnfoldStorePersist();

    afterRestart(({ arc, session, store }) => {
      expect(() => arc.applyInitialArcResult(result, {
        user,
        devotionalLength: 3,
        session: session.captureSyncSession(),
      })).toThrow(arc.DeletedSeriesResultError);
      expect(store.useUnfoldStore.getState().devotionals).toEqual([]);
    });
  });

  it('keeps the newest deletes within a bounded record', () => {
    for (let minute = 0; minute <= 100; minute += 1) {
      rememberDeletedSeries(`series-${minute}`, new Date(Date.UTC(2026, 9, 9, 8, minute)).toISOString());
    }

    afterRestart(({ deleted }) => {
      expect(deleted.wasSeriesDeleted('series-100')).toBe(true);
      expect(deleted.wasSeriesDeleted('series-1')).toBe(true);
      expect(deleted.wasSeriesDeleted('series-0')).toBe(false);
    });
  });
});
