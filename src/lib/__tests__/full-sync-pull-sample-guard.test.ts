jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
}));

jest.mock('../sync-ids', () => ({
  newId: jest.fn(() => 'test-id'),
  compositeId: jest.fn((...parts: unknown[]) => parts.join(':')),
}));

jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => store.set(key, value)),
      removeItem: jest.fn((key: string) => store.delete(key)),
    },
    getDeviceId: jest.fn(() => 'test-device-id'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    __clearMockStorage: () => store.clear(),
  };
});

import { applyPulledUserData } from '../full-sync-pull';
import { useUnfoldStore } from '../store';
import type { Devotional } from '../store';

const SAMPLE_ID = 'onboarding-sample-user-1';

function autoSeries(): Devotional {
  return {
    id: 'auto-1',
    title: 'Auto',
    totalDays: 3,
    currentDay: 1,
    days: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
    generationMode: 'progressive',
    seriesArc: {
      totalDaysPlanned: 3,
      overarchingTheme: 'theme',
      narrativeShape: 'shape',
      dayHints: [],
      isOpenEnded: false,
      createdAt: '2026-07-01T00:00:00.000Z',
      seriesKind: 'auto_trial',
    },
  };
}

function sampleRecord(over: { deleted?: boolean; updatedAt?: string } = {}) {
  return {
    id: SAMPLE_ID,
    updatedAt: over.updatedAt ?? '2026-07-01T12:00:00.000Z',
    deleted: over.deleted ?? false,
    data: {
      title: 'Sample',
      totalDays: 1,
      currentDay: 1,
      createdAt: '2026-07-01T00:00:00.000Z',
    },
  };
}

beforeEach(() => {
  useUnfoldStore.getState().reset();
});

describe('J12 full-sync sample guard', () => {
  it('does not prepend an unknown sample when an auto series exists', () => {
    useUnfoldStore.setState({ devotionals: [autoSeries()] });
    applyPulledUserData({
      timestamp: '2026-07-01T12:00:00.000Z',
      changes: { devotionals: [sampleRecord()] },
    });
    expect(useUnfoldStore.getState().devotionals.map((item) => item.id)).toEqual(['auto-1']);
  });

  it('prepends a sample when no auto series exists', () => {
    applyPulledUserData({
      timestamp: '2026-07-01T12:00:00.000Z',
      changes: { devotionals: [sampleRecord()] },
    });
    expect(useUnfoldStore.getState().devotionals.map((item) => item.id)).toEqual([SAMPLE_ID]);
  });

  it('does not insert a stale sample when the same pull also carries an auto-trial series', () => {
    applyPulledUserData({
      timestamp: '2026-07-01T12:00:00.000Z',
      changes: {
        devotionals: [
          sampleRecord(),
          {
            id: 'auto-1',
            updatedAt: '2026-07-01T12:00:00.000Z',
            deleted: false,
            data: {
              title: 'Auto',
              totalDays: 3,
              currentDay: 1,
              createdAt: '2026-07-01T00:00:00.000Z',
              seriesArc: {
                totalDaysPlanned: 3,
                overarchingTheme: 'theme',
                narrativeShape: 'shape',
                dayHints: [],
                isOpenEnded: false,
                createdAt: '2026-07-01T00:00:00.000Z',
                seriesKind: 'auto_trial',
              },
            },
          },
        ],
      },
    });
    expect(useUnfoldStore.getState().devotionals.map((item) => item.id)).toEqual(['auto-1']);
  });

  it('removes a deleted sample', () => {
    useUnfoldStore.setState({
      devotionals: [{
        ...autoSeries(),
        id: SAMPLE_ID,
        seriesArc: {
          totalDaysPlanned: 1,
          overarchingTheme: 'theme',
          narrativeShape: 'shape',
          dayHints: [],
          isOpenEnded: false,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      }],
    });
    applyPulledUserData({
      timestamp: '2026-07-01T12:00:00.000Z',
      changes: { devotionals: [sampleRecord({ deleted: true, updatedAt: '2026-07-01T13:00:00.000Z' })] },
    });
    expect(useUnfoldStore.getState().devotionals).toEqual([]);
  });
});
