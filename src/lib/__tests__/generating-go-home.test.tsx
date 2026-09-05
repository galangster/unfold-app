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
}));

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
  mockReplace.mockReset();
  mockPollJobStatus.mockReset();
  mockRetryJob.mockReset();
  mockSubmitGenerationJob.mockReset();
  mmkvStorage.removeItem(INFLIGHT_GENERATION_JOB_KEY);
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
  it('regression: Jordan item 6 — Go home marks the kept record so Today watches it instead of bouncing back to /generating', async () => {
    writeInflightGenerationJob({ jobId: 'job-1', devotionalId: 'devo-1', submittedAt: Date.now() - 30_000 });
    mockPollJobStatus.mockResolvedValue({ status: 'processing' });

    const tree = await renderScreen();
    mounted.push(tree);
    // Resumed the record: the screen is on the ripple, polling the server.
    expect(mockPollJobStatus).toHaveBeenCalledWith('job-1');

    await press(tree, GO_HOME_LABEL);

    // The tap always leaves for Today — nothing awaited sits in between.
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/(today)');

    // The record is kept (the server job keeps running) and now carries the
    // marker. Today reads it and keeps the reader there.
    const read = readInflightGenerationJob();
    expect(read).toEqual({
      kind: 'active',
      job: { jobId: 'job-1', devotionalId: 'devo-1', submittedAt: expect.any(Number), leftForHome: true },
    });
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
    expect(readInflightGenerationJob()).toEqual({ kind: 'none' });
    findPressable(tree, 'Try again');

    // The retry request is still in flight when the reader taps Go home:
    // there is no record to mark yet.
    const retry = deferred<{ jobId: string }>();
    mockRetryJob.mockReturnValue(retry.promise);
    await press(tree, 'Try again');
    expect(mockRetryJob).toHaveBeenCalledWith('job-1');
    expect(readInflightGenerationJob()).toEqual({ kind: 'none' });

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
    expect(read).toEqual({
      kind: 'active',
      job: expect.objectContaining({ jobId: 'job-2', leftForHome: true }),
    });
    expect(resolveTodayInflightAction(read, 'running')).toEqual({
      action: 'watch-on-today',
      job: expect.objectContaining({ jobId: 'job-2', leftForHome: true }),
    });
    // Today owns the watch: the unmounted screen does not start polling job-2.
    expect(mockPollJobStatus).not.toHaveBeenCalledWith('job-2');
  });
});
