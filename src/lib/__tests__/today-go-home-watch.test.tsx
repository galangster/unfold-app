/* eslint-disable import/first */
/**
 * Regression pin for Jordan item 6 (App Store 1.1.0, 2026-09-04), Today's
 * side. After "Go home — we'll keep writing" Today must not send the reader
 * back to /generating: it keeps the marked record, shows the preparing card
 * for day 1, and lands the finished series itself through
 * `useInflightInitialArcWatch` — no second visit to /generating.
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
jest.mock('@/lib/generation-api', () => ({
  pollJobStatus: (...args: unknown[]) => mockPollJobStatus(...args),
}));

import { act, create } from 'react-test-renderer';

import { computeDevotionalState, type ComputeInput } from '@/components/home/compute-devotional-state';
import { useInflightInitialArcWatch } from '@/hooks/useInflightInitialArcWatch';
import {
  INFLIGHT_GENERATION_JOB_KEY,
  hasInflightSeriesLanded,
  markInflightJobLeftForHome,
  readInflightGenerationJob,
  resolvePreparingFirstSeriesTitle,
  resolveTodayInflightAction,
  writeInflightGenerationJob,
  type InflightGenerationJob,
} from '../inflight-generation-job';
import { mmkvStorage } from '../mmkv-storage';
import { useUnfoldStore, type UserProfile } from '../store';

const user = {
  name: 'Jordan',
  aboutMe: 'New to this',
  currentSituation: 'Between jobs',
  emotionalState: 'anxious',
  selectedTheme: 'trust',
  selectedType: 'personal',
  devotionalLength: 3,
} as unknown as UserProfile;

const completedStatus = {
  status: 'complete',
  result: {
    devotionalId: 'devo-1',
    seriesTitle: 'Learning to Trust Again',
    totalDays: 3,
    devotionalDay: {
      dayNumber: 1,
      title: 'Trust before understanding',
      scriptureReference: 'Psalm 56:3-4',
      scriptureText: 'When I am afraid, I put my trust in you.',
      bodyText: 'Body',
      quotableLine: 'Line',
      isRead: false,
    },
  },
};

const noop = () => {};
const emptyTodayInput: ComputeInput = {
  currentDevotional: null,
  currentDayData: null,
  hasReadToday: false,
  dayLabel: 'Today',
  isJourneyComplete: false,
  isPreparing: false,
  premiumPolicy: 'granted',
  daysCompleted: 0,
  totalDays: 3,
  progress: 0,
  tomorrowTeaser: null,
  onContinue: noop,
  onReflect: noop,
  onCreateNew: noop,
  onOpenBible: noop,
  onRenewPremium: noop,
  onReveal: noop,
  ctaText: 'Begin Your Journey',
  reflectionStatus: 'empty',
};

/** Today's watch, exactly as the screen mounts it for a record it keeps. */
function TodayWatch({ job, onSettled }: { job: InflightGenerationJob; onSettled: () => void }) {
  useInflightInitialArcWatch({ job, enabled: true, onSettled });
  return null;
}

async function flush() {
  await act(async () => {
    for (let tick = 0; tick < 10; tick++) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPollJobStatus.mockReset();
  mmkvStorage.removeItem(INFLIGHT_GENERATION_JOB_KEY);
  useUnfoldStore.setState({
    devotionals: [],
    currentDevotionalId: null,
    usedScriptures: [],
    user,
    generationSession: { status: 'running', devotionalId: 'devo-1', totalDays: 3, generatedDayNumbers: [] },
  });
});

describe('regression: Jordan item 6 — Today after Go home', () => {
  it('regression: Jordan item 6 — after Go home, Today shows preparing and lands the finished series without a second visit to /generating', async () => {
    // /generating wrote the record at submission; Go home marked it.
    writeInflightGenerationJob({ jobId: 'job-1', devotionalId: 'devo-1', submittedAt: Date.now() - 30_000 });
    expect(markInflightJobLeftForHome()).toEqual(expect.objectContaining({ leftForHome: true }));

    // Today reads the record on focus. Marked: it is watched from here, not
    // sent back to /generating.
    const store = useUnfoldStore.getState();
    const decision = resolveTodayInflightAction(readInflightGenerationJob(), store.generationSession.status);
    expect(decision.action).toBe('watch-on-today');
    if (decision.action !== 'watch-on-today') throw new Error('unreachable');

    // Nothing in the store yet: the preparing card for day 1, not the
    // new-user empty state.
    expect(hasInflightSeriesLanded(decision.job.devotionalId, store.devotionals, store.currentDevotionalId != null)).toBe(false);
    const preparing = computeDevotionalState({
      ...emptyTodayInput,
      preparingInflightSeries: { seriesTitle: resolvePreparingFirstSeriesTitle(store.generationSession.title) },
    });
    expect(preparing).toEqual(expect.objectContaining({ type: 'preparing', dayNumber: 1, seriesTitle: 'your devotional' }));

    // The watch polls the job and lands it the way /generating would have.
    mockPollJobStatus.mockResolvedValue(completedStatus);
    const onSettled = jest.fn();
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<TodayWatch job={decision.job} onSettled={onSettled} />);
    });
    await flush();

    expect(mockPollJobStatus).toHaveBeenCalledWith('job-1');
    const landed = useUnfoldStore.getState();
    expect(landed.currentDevotionalId).toBe('devo-1');
    expect(landed.devotionals).toEqual([
      expect.objectContaining({
        id: 'devo-1',
        title: 'Learning to Trust Again',
        days: [expect.objectContaining({ dayNumber: 1, title: 'Trust before understanding' })],
      }),
    ]);
    expect(landed.generationSession.status).toBe('complete');
    expect(hasInflightSeriesLanded('devo-1', landed.devotionals, landed.currentDevotionalId != null)).toBe(true);
    expect(onSettled).toHaveBeenCalledTimes(1);

    // The record is gone with the series landed: nothing is left for either
    // screen to resume, so /generating is never entered again.
    expect(readInflightGenerationJob()).toBeNull();
    expect(resolveTodayInflightAction(readInflightGenerationJob(), landed.generationSession.status)).toEqual({ action: 'none' });

    await act(async () => {
      tree.unmount();
    });
  });
});
