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

jest.mock('@/lib/notification-ask', () => ({
  askNotificationPermissionInContext: jest.fn(async () => 'granted'),
  readNotificationPermissionState: jest.fn(async () => 'granted'),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  router: { replace: jest.fn(), push: jest.fn() },
}));

import { act, create } from 'react-test-renderer';
import { nextPollDelayMs, useAutoTrialGeneration } from '../useAutoTrialGeneration';
import { POLL_DELAY_INITIAL_MS } from '@/lib/generation-poll-outcome';
import {
  createAutoTrialIntent,
  markAutoTrialIntentDismissed,
  readAutoTrialIntent,
} from '@/lib/auto-trial-intent';
import { readInflightGenerationJob } from '@/lib/inflight-generation-job';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { useUnfoldStore, type UserProfile } from '@/lib/store';

const NOW = Date.parse('2026-09-10T17:00:00.000Z');

function Probe({ intentId }: { intentId: string }) {
  useAutoTrialGeneration(intentId);
  return null;
}

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

describe('H13 useAutoTrialGeneration unmount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mmkvStorage as { __store?: Map<string, string> }).__store?.clear();
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

  it('keeps an accepted submit after unmount and sets leftForHome from dismissedAt', async () => {
    let resolveSubmit!: (value: { jobId: string; devotionalId: string }) => void;
    mockSubmit.mockImplementation(() => new Promise((resolve) => {
      resolveSubmit = resolve;
    }));
    const intent = seedPurchased();
    markAutoTrialIntentDismissed({ nowMs: NOW });
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<Probe intentId={intent.intentId} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    tree.unmount();
    await act(async () => {
      resolveSubmit({ jobId: 'job-late', devotionalId: 'devo-late' });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(readAutoTrialIntent()?.status).toBe('submitted');
    expect(readAutoTrialIntent()?.jobId).toBe('job-late');
    const record = readInflightGenerationJob();
    expect(record?.jobId).toBe('job-late');
    expect(record?.leftForHome).toBe(readAutoTrialIntent()?.dismissedAt != null);
  });

  it('rewrites a missing inflight record after a successful retryJob', async () => {
    mockRetry.mockResolvedValue({ jobId: 'job-1', status: 'pending' });
    mockPoll.mockResolvedValue({ status: 'failed', canRetry: true, error: 'model' });
    const created = seedPurchased();
    const { transitionAutoTrialIntent } = jest.requireActual('@/lib/auto-trial-intent') as typeof import('@/lib/auto-trial-intent');
    transitionAutoTrialIntent('submitted', { jobId: 'job-1', devotionalId: 'devo-1' }, { nowMs: NOW });
    let latest: ReturnType<typeof useAutoTrialGeneration> | null = null;
    function RetryProbe() {
      latest = useAutoTrialGeneration(created.intentId);
      return null;
    }
    await act(async () => {
      create(<RetryProbe />);
    });
    await act(async () => {
      jest.advanceTimersByTime?.(0);
      await Promise.resolve();
      await Promise.resolve();
    });
    const { clearInflightGenerationJob } = jest.requireActual('@/lib/inflight-generation-job') as {
      clearInflightGenerationJob: () => void;
    };
    clearInflightGenerationJob();
    expect(readInflightGenerationJob()).toBeNull();
    await act(async () => {
      latest?.tryAgain();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockRetry).toHaveBeenCalledWith('job-1');
    expect(readInflightGenerationJob()?.jobId).toBe('job-1');
  });
});

describe('nextPollDelayMs', () => {
  it('waits at least the base poll interval for a healthy waiting job', () => {
    expect(nextPollDelayMs(0, {
      unreachable: false,
      generating: true,
      consecutiveNetworkErrors: 0,
      hasCompletedResult: false,
    })).toBeGreaterThanOrEqual(POLL_DELAY_INITIAL_MS);
  });
});
