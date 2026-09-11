/* eslint-disable import/first */
/**
 * Regression pins for Jordan item 6 (App Store 1.1.0, 2026-09-04): "Go home —
 * we'll keep writing" on /generating looked dead. The tap navigated, but the
 * record it left behind carried nothing that said the reader chose to leave,
 * so Today read it as app-kill recovery and bounced straight back.
 *
 * These render the real screen. The pure resolver tests in
 * `inflight-generation-job.test.ts` pin Today's side of the decision; this
 * pins that the tap itself writes the marker — and that a retry which resolves
 * after the tap writes its own record already marked.
 */
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
    },
    getDeviceId: jest.fn(() => 'test-device-id'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    isRecoverySession: jest.fn(() => false),
  };
});

const mockPollJobStatus = jest.fn();
const mockRetryJob = jest.fn();
const mockSubmitGenerationJob = jest.fn();
jest.mock('@/lib/generation-api', () => ({
  submitGenerationJob: (...args: unknown[]) => mockSubmitGenerationJob(...args),
  pollJobStatus: (...args: unknown[]) => mockPollJobStatus(...args),
  retryJob: (...args: unknown[]) => mockRetryJob(...args),
  recoverCompletedGenerationResult: jest.fn(async () => null),
  buildInitialArcUserContext: jest.fn(() => ({})),
  buildAutoTrialUserContext: jest.fn(() => ({})),
}));

const mockGetPermissionsAsync = jest.fn(async (..._args: unknown[]) => ({ status: 'granted' }));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: { getCustomerInfo: jest.fn(async () => ({ entitlements: { active: {} } })) } }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: jest.fn(),
}));
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: '', cacheDirectory: '', readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => undefined) }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '' }, Directory: jest.fn() }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '1' }));
jest.mock('@/lib/notifications', () => ({
  requestNotificationPermissions: jest.fn(async () => false),
  areNotificationsEnabled: jest.fn(async () => false),
}));

jest.mock('@/lib/push-notifications', () => ({
  registerPushToken: jest.fn(async () => 'registered'),
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
  useNavigation: () => ({ setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()) }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-reanimated', () => {
  const { View, Text } = require('react-native');
  const chain: Record<string, unknown> = {};
  chain.duration = () => chain;
  chain.delay = () => chain;
  chain.easing = () => chain;
  return {
    __esModule: true,
    default: { View, Text },
    FadeIn: chain,
    FadeInUp: chain,
    FadeOut: chain,
    Easing: { cubic: 'cubic', out: () => 'out', in: () => 'in', inOut: () => 'inOut' },
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: () => ({}),
    withRepeat: (value: unknown) => value,
    withDelay: (_ms: number, value: unknown) => value,
    withTiming: (value: unknown) => value,
    interpolate: () => 0,
    cancelAnimation: () => undefined,
    useReducedMotion: () => true,
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('@/components/icons', () => ({
  BellIcon: () => null,
  BookOpenTextIcon: () => null,
  WarningCircleIcon: () => null,
}));

jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({
    reducedMotion: true,
    entering: (anim: unknown) => anim,
    exiting: (anim: unknown) => anim,
  }),
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ isDark: true, colors: { accent: '#C8A55C' } }),
}));

import { act, create } from 'react-test-renderer';

import GeneratingScreen from '@/app/generating';
import {
  INFLIGHT_GENERATION_JOB_KEY,
  readInflightGenerationJob,
  resolveTodayInflightAction,
  writeInflightGenerationJob,
} from '../inflight-generation-job';
import {
  beginLocalResetSession,
  endLocalResetSession,
  resetSyncSessionFenceForTesting,
} from '../generation-session';
import {
  INITIAL_GENERATION_REQUEST_ID_KEY,
  readInitialGenerationRequestId,
} from '../initial-generation-request';
import { mmkvStorage } from '../mmkv-storage';
import { useUnfoldStore, type UserProfile } from '../store';

const GO_HOME_LABEL = 'Go home while your devotional is prepared';

const user = {
  name: 'Jordan',
  aboutMe: 'New to this',
  currentSituation: 'Between jobs',
  emotionalState: 'anxious',
  selectedTheme: 'trust',
  selectedType: 'personal',
  devotionalLength: 3,
} as unknown as UserProfile;

type Tree = ReturnType<typeof create>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function flush() {
  await act(async () => {
    for (let tick = 0; tick < 10; tick++) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }
  });
}

async function renderScreen(): Promise<Tree> {
  let tree!: Tree;
  await act(async () => {
    tree = create(<GeneratingScreen />);
  });
  await flush();
  return tree;
}

function findPressable(tree: Tree, label: string) {
  const node = tree.root.findAll(
    (n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function',
  )[0];
  if (!node) throw new Error(`No pressable found with accessibilityLabel "${label}"`);
  return node;
}

async function press(tree: Tree, label: string) {
  await act(async () => {
    findPressable(tree, label).props.onPress();
    await Promise.resolve();
  });
  await flush();
}

const mounted: Tree[] = [];

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetSyncSessionFenceForTesting();
  mockReplace.mockReset();
  mockPollJobStatus.mockReset();
  mockRetryJob.mockReset();
  mockSubmitGenerationJob.mockReset();
  mmkvStorage.removeItem(INFLIGHT_GENERATION_JOB_KEY);
  mmkvStorage.removeItem(INITIAL_GENERATION_REQUEST_ID_KEY);
  mmkvStorage.removeItem('auto-trial-series-intent-v1');
  useUnfoldStore.setState({
    devotionals: [],
    currentDevotionalId: null,
    usedScriptures: [],
    user,
    generationSession: { status: 'running', devotionalId: 'devo-1', totalDays: 3, generatedDayNumbers: [] },
  });
});

afterEach(async () => {
  await act(async () => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
  jest.useRealTimers();
});

describe('regression: Jordan item 6 — Go home from /generating', () => {
  it('reuses one request id when a lost initial POST response is retried', async () => {
    mockSubmitGenerationJob
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockReturnValueOnce(new Promise(() => {}));

    const tree = await renderScreen();
    mounted.push(tree);

    const firstRequestId = mockSubmitGenerationJob.mock.calls[0][0].requestId;
    expect(firstRequestId).toBe(readInitialGenerationRequestId());

    await press(tree, 'Try again');

    expect(mockSubmitGenerationJob).toHaveBeenCalledTimes(2);
    expect(mockSubmitGenerationJob.mock.calls[1][0].requestId).toBe(firstRequestId);
  });

  it('clears the request id when the reader starts over with new answers', async () => {
    mockSubmitGenerationJob.mockRejectedValueOnce(new Error('Request rejected'));

    const tree = await renderScreen();
    mounted.push(tree);
    expect(readInitialGenerationRequestId()).not.toBeNull();

    await press(tree, 'Start over with new answers');

    expect(readInitialGenerationRequestId()).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('regression: Jordan item 6 — Go home marks the kept record so Today watches it instead of bouncing back to /generating', async () => {
    writeInflightGenerationJob({ jobId: 'job-1', devotionalId: 'devo-1', submittedAt: Date.now() - 30_000 });
    mockPollJobStatus.mockResolvedValue({ status: 'processing' });

    const tree = await renderScreen();
    mounted.push(tree);
    // Resumed the record: the screen is on the ripple, polling the server.
    expect(mockPollJobStatus).toHaveBeenCalledWith('job-1', expect.any(Number));

    await press(tree, GO_HOME_LABEL);

    // The tap always leaves for Today — nothing awaited sits in between.
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/(today)');

    // The record is kept (the server job keeps running) and now carries the
    // marker. Today reads it and keeps the reader there.
    const read = readInflightGenerationJob();
    expect(read).toEqual({ jobId: 'job-1', devotionalId: 'devo-1', submittedAt: expect.any(Number), leftForHome: true });
    for (const sessionStatus of ['idle', 'running', 'complete'] as const) {
      expect(resolveTodayInflightAction(read, sessionStatus)).toEqual({
        action: 'watch-on-today',
        job: expect.objectContaining({ jobId: 'job-1', leftForHome: true }),
      });
    }
  });

  it('regression: Jordan item 6 — a retry that resolves after Go home writes its record already marked for Today', async () => {
    // The first job fails on the server: the record is cleared and the error
    // state shows. Try again asks the server to retry that job.
    writeInflightGenerationJob({ jobId: 'job-1', devotionalId: 'devo-1', submittedAt: Date.now() - 30_000 });
    mockPollJobStatus.mockResolvedValue({ status: 'failed', error: 'The writer stumbled', canRetry: true });

    const tree = await renderScreen();
    mounted.push(tree);
    expect(readInflightGenerationJob()).toBeNull();
    findPressable(tree, 'Try again');

    // The retry request is still in flight when the reader taps Go home:
    // there is no record to mark yet.
    const retry = deferred<{ jobId: string }>();
    mockRetryJob.mockReturnValue(retry.promise);
    await press(tree, 'Try again');
    expect(mockRetryJob).toHaveBeenCalledWith('job-1', expect.any(Number));
    expect(readInflightGenerationJob()).toBeNull();

    await press(tree, GO_HOME_LABEL);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/(today)');

    // The retry resolves on a screen nobody is looking at. Its record has to
    // carry the marker itself, or Today reads a fresh unmarked record as
    // app-kill recovery and bounces the reader straight back — the symptom
    // re-created on the retry path.
    mockPollJobStatus.mockClear();
    await act(async () => {
      retry.resolve({ jobId: 'job-2' });
    });
    await flush();

    const read = readInflightGenerationJob();
    expect(read).toEqual(expect.objectContaining({ jobId: 'job-2', leftForHome: true }));
    expect(resolveTodayInflightAction(read, 'running')).toEqual({
      action: 'watch-on-today',
      job: expect.objectContaining({ jobId: 'job-2', leftForHome: true }),
    });
    // Today owns the watch: the unmounted screen does not start polling job-2.
    expect(mockPollJobStatus).not.toHaveBeenCalledWith('job-2', expect.any(Number));
  });

  it('stops a resumed poll on unmount so a late completion cannot land', async () => {
    writeInflightGenerationJob({ jobId: 'job-1', devotionalId: 'devo-1', submittedAt: Date.now() - 30_000 });
    const poll = deferred<{
      status: string;
      result: { devotionalId: string; seriesTitle: string; totalDays: number; devotionalDay: { dayNumber: number; title: string } };
    }>();
    mockPollJobStatus.mockReturnValue(poll.promise);

    const tree = await renderScreen();
    mounted.push(tree);
    expect(mockPollJobStatus).toHaveBeenCalledWith('job-1', expect.any(Number));

    await act(async () => {
      tree.unmount();
    });
    mounted.pop();

    await act(async () => {
      poll.resolve({
        status: 'complete',
        result: {
          devotionalId: 'devo-1',
          seriesTitle: 'Late title',
          totalDays: 3,
          devotionalDay: { dayNumber: 1, title: 'Late day' },
        },
      });
    });
    await flush();

    expect(useUnfoldStore.getState().devotionals).toHaveLength(0);
    expect(useUnfoldStore.getState().generationSession.status).toBe('running');
  });

  it('lets a same-session Go home keep a late first submission for Today', async () => {
    const submit = deferred<{ jobId: string; devotionalId: string }>();
    mockSubmitGenerationJob.mockReturnValue(submit.promise);

    const tree = await renderScreen();
    mounted.push(tree);
    expect(mockSubmitGenerationJob).toHaveBeenCalled();

    await press(tree, GO_HOME_LABEL);

    await act(async () => {
      submit.resolve({ jobId: 'job-late', devotionalId: 'devo-late' });
    });
    await flush();

    const read = readInflightGenerationJob();
    expect(read).toEqual(expect.objectContaining({
      jobId: 'job-late',
      devotionalId: 'devo-late',
      leftForHome: true,
    }));
    expect(resolveTodayInflightAction(read, 'running')).toEqual({
      action: 'watch-on-today',
      job: expect.objectContaining({ jobId: 'job-late', leftForHome: true }),
    });
  });

  it('does not apply a resumed completion after reset invalidates the originating session', async () => {
    writeInflightGenerationJob({ jobId: 'job-1', devotionalId: 'devo-1', submittedAt: Date.now() - 30_000 });
    const poll = deferred<{
      status: string;
      result: { devotionalId: string; seriesTitle: string; totalDays: number; devotionalDay: { dayNumber: number; title: string } };
    }>();
    mockPollJobStatus.mockReturnValue(poll.promise);

    const tree = await renderScreen();
    mounted.push(tree);

    const token = beginLocalResetSession();
    endLocalResetSession(token);

    await act(async () => {
      poll.resolve({
        status: 'complete',
        result: {
          devotionalId: 'devo-1',
          seriesTitle: 'Stale title',
          totalDays: 3,
          devotionalDay: { dayNumber: 1, title: 'Stale day' },
        },
      });
    });
    await flush();

    expect(useUnfoldStore.getState().devotionals).toHaveLength(0);
    expect(useUnfoldStore.getState().generationSession.status).not.toBe('complete');
  });
});

describe('H10 generating auto-trial handoff', () => {
  it('keeps auto-trial on generating without the screen submit or a generation session write', async () => {
    const { createAutoTrialIntent } = jest.requireActual('../auto-trial-intent') as typeof import('../auto-trial-intent');
    createAutoTrialIntent({
      deviceId: 'test-device-id',
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
      nowMs: 1_800_000_000_000,
    });
    const sessionBefore = useUnfoldStore.getState().generationSession;
    const tree = await renderScreen();
    mounted.push(tree);
    expect(mockReplace).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/series-reveal' }));
    expect(useUnfoldStore.getState().generationSession).toEqual(sessionBefore);
  });
});
