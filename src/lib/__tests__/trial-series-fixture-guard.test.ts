/* eslint-disable import/first */
const backend = { PRIMARY_BACKEND_URL: 'https://api.unfoldapp.co' };

jest.mock('../backend-url', () => ({
  get PRIMARY_BACKEND_URL() {
    return backend.PRIMARY_BACKEND_URL;
  },
}));

jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
  logBugEvent: jest.fn(),
}));

jest.mock('../check-in-flush', () => ({
  flushCheckInToServer: jest.fn(async () => 'sent'),
}));

jest.mock('../auto-trial-telemetry', () => ({
  trackAutoTrialLanded: jest.fn(),
  trackAutoTrialAbandoned: jest.fn(),
}));

jest.mock('expo-router', () => ({
  Redirect: () => null,
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
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
    getDeviceId: jest.fn(() => 'qa-fixture-device'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    isRecoverySession: jest.fn(() => false),
  };
});

import { applyTrialSeriesSeed } from '@/app/dev/trial-series';
import { AUTO_TRIAL_INTENT_KEY } from '../auto-trial-intent';
import { assertTrialSeriesFixtureEnvironment } from '../dev-seed';
import { mmkvStorage } from '../mmkv-storage';
import { useUnfoldStore } from '../store';

describe('L7 trial series fixture guard', () => {
  afterEach(() => {
    backend.PRIMARY_BACKEND_URL = 'https://api.unfoldapp.co';
    mmkvStorage.removeItem(AUTO_TRIAL_INTENT_KEY);
    useUnfoldStore.setState({
      devotionals: [],
      currentDevotionalId: null,
      user: null,
    });
  });

  it('throws on a production URL', () => {
    backend.PRIMARY_BACKEND_URL = 'https://api.unfoldapp.co';
    expect(() => assertTrialSeriesFixtureEnvironment()).toThrow(
      'Trial series fixtures require the isolated local environment.',
    );
    expect(() => applyTrialSeriesSeed({
      state: 'today-day1',
      now: new Date(2026, 8, 11, 15, 30, 0),
    })).toThrow('Trial series fixtures require the isolated local environment.');
  });

  it('seeds on the loopback stub URL', () => {
    backend.PRIMARY_BACKEND_URL = 'http://127.0.0.1:8797';
    expect(() => assertTrialSeriesFixtureEnvironment()).not.toThrow();
    const seed = applyTrialSeriesSeed({
      state: 'today-day1',
      now: new Date(2026, 8, 11, 15, 30, 0),
    });
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(seed.devotional?.id);
    expect(useUnfoldStore.getState().devotionals).toHaveLength(1);
  });

  it('writes the terminal intent record once', () => {
    backend.PRIMARY_BACKEND_URL = 'http://127.0.0.1:8797';
    const now = new Date(2026, 8, 11, 15, 30, 0);
    for (const state of ['confirmation', 'reveal-exhausted', 'today-day1', 'series-complete'] as const) {
      const seed = applyTrialSeriesSeed({ state, now });
      expect(JSON.parse((mmkvStorage.getItem(AUTO_TRIAL_INTENT_KEY) as string | null)!)).toEqual(seed.intent);
    }
    applyTrialSeriesSeed({ state: 'later-entry-notify', now });
    expect(mmkvStorage.getItem(AUTO_TRIAL_INTENT_KEY)).toBeNull();
  });
});
