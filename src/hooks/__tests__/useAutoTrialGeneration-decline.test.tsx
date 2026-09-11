/* eslint-disable import/first */
jest.mock('../../lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('../../lib/bug-logger', () => ({
  logBugError: jest.fn(),
  logBugEvent: jest.fn(),
}));

jest.mock('../../lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../lib/mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => store.set(key, value)),
      removeItem: jest.fn((key: string) => store.delete(key)),
      __store: store,
    },
    getDeviceId: jest.fn(() => 'device-1'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    isRecoverySession: jest.fn(() => false),
  };
});

const mockSubmit = jest.fn();
const mockPoll = jest.fn();
const mockRetry = jest.fn();
jest.mock('@/lib/generation-api', () => {
  const actual = jest.requireActual('@/lib/generation-api') as Record<string, unknown>;
  return {
    ...actual,
    submitGenerationJob: (...args: unknown[]) => mockSubmit(...args),
    pollJobStatus: (...args: unknown[]) => mockPoll(...args),
    retryJob: (...args: unknown[]) => mockRetry(...args),
  };
});

jest.mock('@/lib/user-profile-sync', () => ({
  syncUserProfileToBackend: jest.fn(async () => undefined),
}));

jest.mock('@/lib/devotional-sync-pull', () => ({
  pullDevotionalContent: jest.fn(async () => ({ days: [], timestamp: 't' })),
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  router: { replace: mockReplace, push: jest.fn() },
}));

import { act, create } from 'react-test-renderer';
import { useAutoTrialGeneration } from '../useAutoTrialGeneration';
import { createAutoTrialIntent, readAutoTrialIntent } from '@/lib/auto-trial-intent';
import { ApiError } from '@/lib/generation-api';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { useUnfoldStore, type UserProfile } from '@/lib/store';

const NOW = Date.parse('2026-09-10T17:00:00.000Z');

const UNAVAILABLE_MESSAGES = {
  switch_off: 'Auto trial series is turned off.',
  platform: 'Auto trial series is not available on this platform.',
  trial_length: 'Auto trial length exceeds the allowed maximum.',
  trial_expired: 'Auto trial has expired.',
} as const;

function seedPurchased() {
  return createAutoTrialIntent({
    deviceId: 'device-1',
    entry: 'onboarding',
    surface: 'onboarding_paywall',
    source: 'purchase',
    simulated: false,
    trialDays: 3,
    purchasedAt: '2026-09-08T17:00:00.000Z',
    expiresAt: '2026-09-11T17:00:00.000Z',
    timeZone: 'America/Chicago',
    isSandbox: false,
    productIdentifier: 'unfold_premium_yearly',
    switchFetchedAt: '2026-09-08T17:00:00.000Z',
    nowMs: NOW,
  });
}

async function flush() {
  await act(async () => {
    for (let tick = 0; tick < 12; tick += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  });
}

describe('useAutoTrialGeneration AUTO_TRIAL_UNAVAILABLE', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    (mmkvStorage as { __store?: Map<string, string> }).__store?.clear();
    mockReplace.mockReset();
    useUnfoldStore.setState({
      user: {
        name: 'Nick',
        aboutMe: 'x',
        currentSituation: 'y',
        emotionalState: 'z',
        spiritualSeeking: 's',
        hasCompletedOnboarding: true,
        devotionalLength: 3,
      } as unknown as UserProfile,
      devotionals: [],
    });
    mockPoll.mockResolvedValue({ status: 'pending' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['switch_off', 'server_unavailable'],
    ['platform', 'server_unavailable'],
    ['trial_length', 'server_unavailable'],
    ['trial_expired', 'trial_expired_before_submit'],
  ] as const)(
    'declines AUTO_TRIAL_UNAVAILABLE %s, abandons with %s, and redirects to setup',
    async (reason, abandonReason) => {
      mockSubmit.mockRejectedValue(
        new ApiError(
          UNAVAILABLE_MESSAGES[reason],
          409,
          'AUTO_TRIAL_UNAVAILABLE',
          null,
          reason,
        ),
      );
      const created = seedPurchased();
      const probe: { latest: ReturnType<typeof useAutoTrialGeneration> | null } = { latest: null };
      function Probe() {
        probe.latest = useAutoTrialGeneration(created.intentId);
        return null;
      }

      await act(async () => {
        create(<Probe />);
      });
      await flush();

      expect(probe.latest?.state).toEqual({ kind: 'declined', reason });
      const intent = readAutoTrialIntent();
      expect(intent?.status).toBe('abandoned');
      expect(intent?.abandonReason).toBe(abandonReason);

      await act(async () => {
        probe.latest?.setUpSeries();
      });
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/onboarding',
        params: { startAt: 'themeType', flow: 'newSeries' },
      });
    },
  );
});
