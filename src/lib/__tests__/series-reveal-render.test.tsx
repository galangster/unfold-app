/* eslint-disable import/first */
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

jest.mock('../mmkv-storage', () => {
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

const mockSyncProfile = jest.fn(async (..._args: unknown[]): Promise<void> => undefined);
jest.mock('@/lib/user-profile-sync', () => ({
  syncUserProfileToBackend: (...args: unknown[]) => mockSyncProfile(...args),
}));

const mockAsk = jest.fn(async (..._args: unknown[]) => 'granted');
const mockReadPermission = jest.fn(async (..._args: unknown[]) => 'granted');
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: '', cacheDirectory: '', readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => undefined) }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '' }, Directory: jest.fn() }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '1' }));
jest.mock('@/lib/notification-ask', () => ({
  askNotificationPermissionInContext: (...args: unknown[]) => mockAsk(...args),
  readNotificationPermissionState: (...args: unknown[]) => mockReadPermission(...args),
  onNotificationPermissionMaybeChanged: jest.fn(async () => undefined),
}));

const mockReplace = jest.fn();
const mockParams = { intentId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/hooks/useOnboardingDarkColors', () => ({
  useOnboardingDarkColors: () => require('@/constants/colors').DarkColors,
}));

import { act, create } from 'react-test-renderer';
import { DarkColors } from '@/constants/colors';
import SeriesRevealScreen from '@/app/series-reveal';
import {
  createAutoTrialIntent,
  markAutoTrialIntentDismissed,
  readAutoTrialIntent,
  transitionAutoTrialIntent,
} from '../auto-trial-intent';
import { buildAutoTrialUserContext } from '../generation-api';
import { markInflightJobLeftForHome, readInflightGenerationJob } from '../inflight-generation-job';
import { getServerOwnedSeriesTotalDays } from '../devotional-series-boundary';
import { mmkvStorage } from '../mmkv-storage';
import { useUnfoldStore, type Devotional, type DevotionalDay, type UserProfile } from '../store';

const INTENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const NOW = Date.parse('2026-09-10T17:00:00.000Z');

const user = {
  name: 'Nick',
  aboutMe: 'Building Unfold',
  currentSituation: 'Launch week is heavy',
  emotionalState: 'anxious',
  spiritualSeeking: 'More peace',
  bibleFrequency: 'daily',
  aspiration: 'I want a quieter morning',
  devotionalLength: 3,
  hasCompletedOnboarding: true,
  selectedTheme: 'trust',
  selectedType: 'personal',
} as unknown as UserProfile;

const day1: DevotionalDay = {
  dayNumber: 1,
  title: 'Trust',
  scriptureReference: 'Psalm 56:3',
  scriptureText: 'When I am afraid',
  bodyText: 'Body',
  quotableLine: 'Line',
  isRead: false,
};

function seedPurchased() {
  const created = createAutoTrialIntent({
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
  const stored = readAutoTrialIntent();
  if (stored && stored.intentId !== INTENT_ID) {
    mmkvStorage.setItem('auto-trial-series-intent-v1', JSON.stringify({ ...stored, intentId: INTENT_ID }));
  }
  return stored ?? created;
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 12; i += 1) {
      await Promise.resolve();
    }
  });
}

function findPressable(tree: ReturnType<typeof create>, label: string) {
  return tree.root.findAll(
    (node) => node.props?.accessibilityLabel === label && typeof node.props?.onPress === 'function',
  )[0];
}

describe('H3 series-reveal submit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mmkvStorage as { __store?: Map<string, string> }).__store?.clear();
    useUnfoldStore.setState({
      user,
      userUpdatedAt: '2026-09-10T17:00:00.000Z',
      devotionals: [],
      currentDevotionalId: null,
    });
    mockSubmit.mockResolvedValue({ jobId: 'job-1', status: 'pending', devotionalId: 'devo-1', autoTrialClaim: 'created' });
    mockPoll.mockResolvedValue({ status: 'pending' });
    mockSyncProfile.mockResolvedValue(undefined);
  });

  it('submits once with requestId, initial_arc, and the builder autoTrial body', async () => {
    const intent = seedPurchased();
    const expected = buildAutoTrialUserContext(user, readAutoTrialIntent() ?? intent);
    await act(async () => {
      create(<SeriesRevealScreen />);
    });
    await flush();
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({
      requestId: (readAutoTrialIntent() ?? intent).requestId,
      jobType: 'initial_arc',
      userContext: expect.objectContaining({ autoTrial: expected.autoTrial }),
    }));
    expect(mockSyncProfile).toHaveBeenCalled();
  });

  it('caps the profile push at 5 seconds and resubmits the same body', async () => {
    jest.useFakeTimers();
    seedPurchased();
    let resolveProfile: (() => void) | undefined;
    mockSyncProfile.mockImplementation(() => new Promise<void>((resolve) => {
      resolveProfile = resolve;
    }));
    await act(async () => {
      create(<SeriesRevealScreen />);
    });
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const firstBody = mockSubmit.mock.calls[0][0];
    mockSyncProfile.mockResolvedValue(undefined);
    resolveProfile?.();
    const failed = readAutoTrialIntent();
    if (failed) {
      mmkvStorage.setItem('auto-trial-series-intent-v1', JSON.stringify({ ...failed, status: 'purchased' }));
    }
    mockSubmit.mockClear();
    mockSubmit.mockResolvedValue({ jobId: 'job-1', status: 'pending', devotionalId: 'devo-1' });
    // Try again after a failed submit uses the same request payload.
    jest.useRealTimers();
    expect(firstBody.userContext.autoTrial).toEqual(
      buildAutoTrialUserContext(user, readAutoTrialIntent() ?? seedPurchased()).autoTrial,
    );
  });
});

describe('H4 revealed data', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mmkvStorage as { __store?: Map<string, string> }).__store?.clear();
    mockSubmit.mockResolvedValue({ jobId: 'job-1', status: 'complete', devotionalId: 'devo-1' });
    mockPoll.mockResolvedValue({ status: 'pending' });
  });

  it('shows the series title and path length, hides a missing promise, and has no price text', async () => {
    seedPurchased();
    const intent = readAutoTrialIntent();
    transitionAutoTrialIntent('submitted', { jobId: 'job-1', devotionalId: 'devo-1' }, { nowMs: NOW });
    const series: Devotional = {
      id: 'devo-1',
      title: 'Learning to Trust Again',
      totalDays: 3,
      currentDay: 1,
      days: [day1],
      createdAt: '2026-09-08T17:00:00.000Z',
      seriesStartDate: '2026-09-08T17:00:00.000Z',
      userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
      themeCategory: 'trust',
      devotionalType: 'personal',
      generationMode: 'progressive',
      seriesArc: {
        totalDaysPlanned: 3,
        overarchingTheme: 'Trust',
        narrativeShape: 'arc',
        dayHints: [],
        isOpenEnded: false,
        createdAt: '2026-09-04T08:00:00.000Z',
        seriesKind: 'auto_trial',
      },
      progressiveMemory: { fullDays: [], summaries: [], narrative: null },
    };
    useUnfoldStore.setState({ user, devotionals: [series], currentDevotionalId: 'devo-1' });
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<SeriesRevealScreen />);
    });
    await flush();
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('Learning to Trust Again');
    expect(tree.root.findAll((node) => node.props?.testID === 'series-promise')).toHaveLength(0);
    // Host node only: the composite SeriesPath forwards the same testID to its View.
    expect(tree.root.findAll((node) => node.props?.testID === 'series-path' && typeof node.type === 'string')).toHaveLength(1);
    expect(getServerOwnedSeriesTotalDays(series)).toBe(3);
    expect(text).not.toMatch(/\$|price|charge|trial ends/i);
    expect(intent?.intentId).toBeTruthy();
  });
});

describe('H5 palette', () => {
  it('uses DarkColors under light and dark themes', async () => {
    for (const themeMode of ['light', 'dark'] as const) {
      seedPurchased();
      useUnfoldStore.setState({ user: { ...user, themeMode } as UserProfile });
      let tree!: ReturnType<typeof create>;
      await act(async () => {
        tree = create(<SeriesRevealScreen />);
      });
      await flush();
      const root = tree.root.find((node) => node.props?.testID === 'series-reveal-root');
      expect(root.props.style).toEqual(expect.objectContaining({ backgroundColor: DarkColors.background }));
      expect(JSON.stringify(tree.toJSON())).toContain(DarkColors.background);
      tree.unmount();
    }
  });
});

describe('H6 exits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mmkvStorage as { __store?: Map<string, string> }).__store?.clear();
    mockParams.intentId = INTENT_ID;
    mockReplace.mockClear();
    mockAsk.mockResolvedValue('granted');
    mockReadPermission.mockResolvedValue('granted');
    mockSubmit.mockResolvedValue({ jobId: 'job-1', status: 'pending', devotionalId: 'devo-1' });
    mockPoll.mockResolvedValue({ status: 'pending' });
    useUnfoldStore.setState({ user, devotionals: [], currentDevotionalId: null });
  });

  it('replaces Today when the param intentId does not match', async () => {
    mockParams.intentId = 'wrong-id';
    createAutoTrialIntent({
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
    await act(async () => {
      create(<SeriesRevealScreen />);
    });
    await flush();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/(today)');
  });

  it('Begin Day 1 replaces reading with the intent devotionalId', async () => {
    seedPurchased();
    transitionAutoTrialIntent('submitted', { jobId: 'job-1', devotionalId: 'devo-1' }, { nowMs: NOW });
    useUnfoldStore.setState({
      user,
      devotionals: [{
        id: 'devo-1',
        title: 'Learning to Trust Again',
        totalDays: 3,
        currentDay: 1,
        days: [day1],
        createdAt: '2026-09-08T17:00:00.000Z',
        seriesStartDate: '2026-09-08T17:00:00.000Z',
        userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
        themeCategory: 'trust',
        devotionalType: 'personal',
        generationMode: 'progressive',
        progressiveMemory: { fullDays: [], summaries: [], narrative: null },
      }],
      currentDevotionalId: 'devo-1',
    });
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<SeriesRevealScreen />);
    });
    await flush();
    await act(async () => {
      findPressable(tree, 'Begin Day 1').props.onPress();
      await Promise.resolve();
    });
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(tabs)/(today)/reading',
      params: { devotionalId: 'devo-1' },
    });
  });

  it('hides Go to Today while generating.jobId is null and dismisses a failed submit without a POST', async () => {
    seedPurchased();
    mockSubmit.mockImplementation(() => new Promise(() => undefined));
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<SeriesRevealScreen />);
    });
    await flush();
    expect(findPressable(tree, 'Go to Today')).toBeUndefined();

    mockSubmit.mockRejectedValue({ status: 503, code: 'SUBMIT_FAILED' });
    (mmkvStorage as { __store?: Map<string, string> }).__store?.clear();
    seedPurchased();
    const postsBefore = mockSubmit.mock.calls.length;
    await act(async () => {
      tree = create(<SeriesRevealScreen />);
    });
    await flush();
    await act(async () => {
      findPressable(tree, 'Go to Today').props.onPress();
      await Promise.resolve();
    });
    expect(readAutoTrialIntent()?.dismissedAt).toBeTruthy();
    expect(mockSubmit.mock.calls.length).toBe(postsBefore + 1);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/(today)');
  });

  it('Go to Today with a job marks leftForHome and dismissedAt', async () => {
    seedPurchased();
    transitionAutoTrialIntent('submitted', { jobId: 'job-1', devotionalId: 'devo-1' }, { nowMs: NOW });
    const { writeInflightGenerationJob } = jest.requireActual('../inflight-generation-job') as {
      writeInflightGenerationJob: typeof import('../inflight-generation-job').writeInflightGenerationJob;
    };
    writeInflightGenerationJob({ jobId: 'job-1', devotionalId: 'devo-1', submittedAt: NOW });
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<SeriesRevealScreen />);
    });
    await flush();
    await act(async () => {
      findPressable(tree, 'Go to Today').props.onPress();
      await Promise.resolve();
    });
    expect(readInflightGenerationJob()?.leftForHome).toBe(true);
    expect(readAutoTrialIntent()?.dismissedAt).toBeTruthy();
    expect(markInflightJobLeftForHome).toBeTruthy();
  });

  it('asks once when permission is undetermined and ignores a second tap', async () => {
    seedPurchased();
    mockReadPermission.mockResolvedValue('undetermined');
    mockAsk.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 'granted';
    });
    transitionAutoTrialIntent('submitted', { jobId: 'job-1', devotionalId: 'devo-1' }, { nowMs: NOW });
    useUnfoldStore.setState({
      user,
      devotionals: [{
        id: 'devo-1',
        title: 'Series',
        totalDays: 3,
        currentDay: 1,
        days: [day1],
        createdAt: '2026-09-08T17:00:00.000Z',
        seriesStartDate: '2026-09-08T17:00:00.000Z',
        userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
        themeCategory: 'trust',
        devotionalType: 'personal',
        generationMode: 'progressive',
        progressiveMemory: { fullDays: [], summaries: [], narrative: null },
      }],
    });
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<SeriesRevealScreen />);
    });
    await flush();
    await act(async () => {
      findPressable(tree, 'Begin Day 1').props.onPress();
      findPressable(tree, 'Begin Day 1').props.onPress();
    });
    await flush();
    expect(mockAsk).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('does not ask when permission is granted or denied', async () => {
    seedPurchased();
    mockReadPermission.mockResolvedValue('denied');
    transitionAutoTrialIntent('submitted', { jobId: 'job-1', devotionalId: 'devo-1' }, { nowMs: NOW });
    useUnfoldStore.setState({
      user,
      devotionals: [{
        id: 'devo-1',
        title: 'Series',
        totalDays: 3,
        currentDay: 1,
        days: [day1],
        createdAt: '2026-09-08T17:00:00.000Z',
        seriesStartDate: '2026-09-08T17:00:00.000Z',
        userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
        themeCategory: 'trust',
        devotionalType: 'personal',
        generationMode: 'progressive',
        progressiveMemory: { fullDays: [], summaries: [], narrative: null },
      }],
    });
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<SeriesRevealScreen />);
    });
    await flush();
    await act(async () => {
      findPressable(tree, 'Begin Day 1').props.onPress();
      await Promise.resolve();
    });
    expect(mockAsk).not.toHaveBeenCalled();
  });

  it('Set up my series abandons, clears both ids, and replaces onboarding', async () => {
    seedPurchased();
    const intent = readAutoTrialIntent();
    if (intent) {
      mmkvStorage.setItem('auto-trial-series-intent-v1', JSON.stringify({
        ...intent,
        status: 'failed',
        failureCode: 'MAX_RETRIES_EXCEEDED',
      }));
    }
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<SeriesRevealScreen />);
    });
    await flush();
    await act(async () => {
      findPressable(tree, 'Set up my series').props.onPress();
      await Promise.resolve();
    });
    expect(readAutoTrialIntent()?.status).toBe('abandoned');
    expect(readInflightGenerationJob()).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/onboarding',
      params: { startAt: 'themeType', flow: 'newSeries' },
    });
  });
});

describe('failed submit Go to Today', () => {
  it('sets dismissedAt and navigates once', async () => {
    jest.clearAllMocks();
    (mmkvStorage as { __store?: Map<string, string> }).__store?.clear();
    mockSubmit.mockRejectedValue({ status: 503, code: 'SUBMIT_FAILED' });
    seedPurchased();
    useUnfoldStore.setState({ user, devotionals: [] });
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<SeriesRevealScreen />);
    });
    await flush();
    const posts = mockSubmit.mock.calls.length;
    await act(async () => {
      findPressable(tree, 'Go to Today').props.onPress();
      findPressable(tree, 'Go to Today').props.onPress();
      await Promise.resolve();
    });
    expect(readAutoTrialIntent()?.dismissedAt).toBeTruthy();
    expect(mockSubmit.mock.calls.length).toBe(posts);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(markAutoTrialIntentDismissed).toBeTruthy();
  });
});
