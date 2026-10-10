/**
 * The finished first devotional on Today. Its series row has two writers:
 * this phone names it by its day, and the server's onboarding job names it
 * "Your First Devotional". Today's pull copies the server's title over the
 * local one, so the stored title changes with the sync order, and a relaunch
 * brings back the day title the phone pushed. The card must read the same
 * either way: the series name as the caption, the devotional title in the
 * sentence.
 */
/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from 'react';

const renderer = require('react-test-renderer');
const { act } = renderer;

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => {
    const values = new Map<string, string>();
    return {
      getString: jest.fn((key: string) => values.get(key)),
      set: jest.fn((key: string, value: string) => values.set(key, value)),
      delete: jest.fn((key: string) => values.delete(key)),
    };
  }),
}));

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '1' }));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('@/lib/bug-logger', () => ({
  logBugError: jest.fn(),
  logBugEvent: jest.fn(),
}));

jest.mock('@/lib/mmkv-storage', () => {
  const values = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => values.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => values.set(key, value)),
      removeItem: jest.fn((key: string) => values.delete(key)),
    },
    getDeviceId: jest.fn(() => 'test-device-id'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    isRecoverySession: jest.fn(() => false),
  };
});

jest.mock('react-native-reanimated', () => {
  const { View, Text } = require('react-native');
  const animation: Record<string, unknown> = {};
  animation.duration = () => animation;
  animation.delay = () => animation;
  animation.easing = () => animation;
  return {
    __esModule: true,
    default: { View, Text, createAnimatedComponent: (component: unknown) => component },
    Extrapolation: { CLAMP: 'clamp' },
    FadeIn: animation,
    FadeOut: animation,
    interpolate: (_value: number, _input: number[], output: number[]) => output[output.length - 1],
    interpolateColor: (_value: number, _input: number[], output: string[]) => output[output.length - 1],
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    useAnimatedProps: (factory: () => unknown) => factory(),
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useReducedMotion: () => true,
    useSharedValue: (value: unknown) => require('react').useRef({ value }).current,
    withDelay: (_delay: unknown, value: unknown) => value,
    withRepeat: (value: unknown) => value,
    cancelAnimation: jest.fn(),
    withTiming: (value: unknown) => value,
    Easing: {
      cubic: jest.fn(),
      bezier: jest.fn(() => 'ease-bezier'),
      out: jest.fn(() => 'ease-out'),
      in: jest.fn(() => 'ease-in'),
      inOut: jest.fn(() => 'ease-in-out'),
    },
  };
});

jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  const Stub = (props: { children?: React.ReactNode }) => ReactLib.createElement(View, null, props.children);
  return { __esModule: true, default: Stub, Path: Stub };
});

jest.mock('phosphor-react-native', () => ({ CheckIcon: () => null, PlusIcon: () => null }));

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    require('react').useEffect(callback, []);
  },
}));

// The recommendation below the sentence has its own test.
jest.mock('../RecommendedSeriesCard', () => ({ RecommendedSeriesCard: () => null }));

jest.mock('@/components/ui', () => ({
  alpha: (color: string, opacity: number) => `${color}:${opacity}`,
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      background: '#0a0a0a',
      backgroundElevated: '#181614',
      text: '#f5f0e8',
      textMuted: '#b9ad9e',
      textSubtle: '#8c8176',
      inputBackground: '#111111',
      border: '#2c2823',
      accent: '#c8a55c',
    },
  }),
}));

jest.mock('@/hooks/useAppForegrounded', () => ({ useAppForegrounded: () => true }));

jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({
    reducedMotion: true,
    entering: (animation: unknown) => animation,
    exiting: (animation: unknown) => animation,
  }),
}));

import { DevotionalCard } from '../DevotionalCard';
import { computeDevotionalState, type DevotionalCardState } from '../compute-devotional-state';
import { applyPulledDevotionalContent } from '@/lib/devotional-pulled-content';
import { extractPulledDevotionalContent } from '@/lib/devotional-sync-pull';
import { persistOnboardingFirstReading } from '@/lib/onboarding-first-reading';
import {
  flushUnfoldStorePersist,
  updateSyncedDevotionals,
  useUnfoldStore,
  type Devotional,
  type DevotionalDay,
} from '@/lib/store';

const SAMPLE_ID = 'onboarding-sample-complete-names';
const DAY_TITLE = 'Synthetic First Reading';
const SERVER_SERIES_TITLE = 'Your First Devotional';
const noop = () => {};

const firstDay: DevotionalDay = {
  dayNumber: 1,
  title: DAY_TITLE,
  scriptureReference: 'Psalm 23:1',
  scriptureText: 'Synthetic scripture text.',
  bodyText: 'Synthetic devotional body.',
  quotableLine: 'Synthetic quotable line.',
  isRead: false,
};

/** Today's focus pull of the current series, with the series row the server holds. */
function pullSeriesRow(data: Record<string, unknown>, at: string) {
  const pulled = extractPulledDevotionalContent({
    changes: {
      devotionals: [{
        id: SAMPLE_ID,
        data: { totalDays: 1, currentDay: 1, generationMode: 'progressive', ...data, clientUpdatedAt: at },
        updatedAt: at,
        deleted: false,
      }],
    },
    timestamp: at,
  }, SAMPLE_ID);
  applyPulledDevotionalContent({
    devotionalId: SAMPLE_ID,
    pulled,
    updateDevotionalDays: useUnfoldStore.getState().updateDevotionalDays,
    updateDevotionals: updateSyncedDevotionals,
  });
}

const storedTitle = () => useUnfoldStore.getState().devotionals.find((row) => row.id === SAMPLE_ID)?.title;

const FINISHED = {
  hasReadToday: true,
  isJourneyComplete: true,
  premiumPolicy: 'denied',
  daysCompleted: 1,
  progress: 100,
} as const;

const UNREAD = {
  hasReadToday: false,
  isJourneyComplete: false,
  premiumPolicy: 'granted',
  daysCompleted: 0,
  progress: 0,
} as const;

function renderTodayCard(
  progress: typeof FINISHED | typeof UNREAD = FINISHED,
  expectedType: DevotionalCardState['type'] = 'journey-complete',
): string[] {
  const { devotionals, currentDevotionalId } = useUnfoldStore.getState();
  const current = devotionals.find((row) => row.id === currentDevotionalId) ?? null;
  expect(current?.id).toBe(SAMPLE_ID);
  return renderCard(computeDevotionalState({
    ...progress,
    currentDevotional: current,
    currentDayData: current?.days[0] ?? null,
    dayLabel: 'Today',
    isPreparing: false,
    totalDays: 1,
    tomorrowTeaser: null,
    onContinue: noop,
    onCreateNew: noop,
    onOpenBible: noop,
    onRenewPremium: noop,
    onReveal: noop,
    ctaText: 'Begin',
  }), expectedType);
}

function renderCard(state: DevotionalCardState, expectedType: DevotionalCardState['type']): string[] {
  expect(state.type).toBe(expectedType);
  const { Text } = require('react-native');
  let tree!: ReturnType<typeof renderer.create>;
  act(() => {
    tree = renderer.create(<DevotionalCard state={state} />);
  });
  const texts = tree.root.findAllByType(Text).map((node: { props: { children: unknown } }) => (
    ([] as unknown[]).concat(node.props.children).join('')
  ));
  act(() => tree.unmount());
  return texts;
}

describe('the first devotional on Today', () => {
  beforeEach(() => {
    useUnfoldStore.getState().reset();
    flushUnfoldStorePersist();
  });

  it('shows the series name and the devotional title the same way before and after a relaunch', async () => {
    expect(persistOnboardingFirstReading({ id: SAMPLE_ID, day: firstDay })).toBe(true);
    useUnfoldStore.getState().markDayAsRead(SAMPLE_ID, 1);
    expect(storedTitle()).toBe(DAY_TITLE);

    // Before the phone's push lands, the server still holds its own name.
    pullSeriesRow({ title: SERVER_SERIES_TITLE }, '2099-01-01T00:00:00.000Z');
    expect(storedTitle()).toBe(SERVER_SERIES_TITLE);
    const before = renderTodayCard();

    // Relaunch. The pushed day title is on the server now.
    flushUnfoldStorePersist();
    await useUnfoldStore.persist.rehydrate();
    pullSeriesRow({
      title: DAY_TITLE,
      seriesArc: useUnfoldStore.getState().devotionals.find((row) => row.id === SAMPLE_ID)?.seriesArc,
    }, '2099-01-02T00:00:00.000Z');
    expect(storedTitle()).toBe(DAY_TITLE);
    const after = renderTodayCard();

    expect(after).toEqual(before);
    expect(before).toContain(SERVER_SERIES_TITLE);
    // The first reading does not count toward the streak, and the rhythm card
    // says the streak starts tomorrow, so this sentence makes no streak claim.
    expect(before).toContain(
      `${DAY_TITLE} is complete. Prepare your next study now or tomorrow, then return for tomorrow’s reading.`,
    );
    expect(before.join(' ')).not.toContain('Your streak continues');
  });

  // One source for the name: every state uses it, not only the finished one.
  it('shows the series name on the unread first devotional before and after the server title lands', () => {
    expect(persistOnboardingFirstReading({ id: SAMPLE_ID, day: firstDay })).toBe(true);
    expect(storedTitle()).toBe(DAY_TITLE);
    const before = renderTodayCard(UNREAD, 'unread');

    pullSeriesRow({ title: SERVER_SERIES_TITLE }, '2099-01-01T00:00:00.000Z');
    expect(storedTitle()).toBe(SERVER_SERIES_TITLE);
    const after = renderTodayCard(UNREAD, 'unread');

    expect(after).toEqual(before);
    expect(before).toContain(SERVER_SERIES_TITLE);
  });

  it('keeps the streak line for a finished series that is not the first reading', () => {
    const series = {
      id: 'synthetic-series',
      title: 'Synthetic Series',
      days: [{ ...firstDay, isRead: true }],
    } as Devotional;
    const texts = renderCard(computeDevotionalState({
      ...FINISHED,
      currentDevotional: series,
      currentDayData: series.days[0],
      dayLabel: 'Today',
      isPreparing: false,
      totalDays: 1,
      tomorrowTeaser: null,
      onContinue: noop,
      onCreateNew: noop,
      onOpenBible: noop,
      onRenewPremium: noop,
      onReveal: noop,
      ctaText: '',
    }), 'journey-complete');

    expect(texts).toContain(
      'Synthetic Series is complete. Your streak continues across series. Prepare your next study now or tomorrow, then return for tomorrow’s reading.',
    );
  });
});
