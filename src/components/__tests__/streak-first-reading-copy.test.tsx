/**
 * The onboarding devotional is read today but does not count toward the
 * streak. Today's rhythm card, its spoken label and Streak Settings all say
 * the streak starts with tomorrow's reading, before and after a relaunch.
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

jest.mock('../../lib/mmkv-storage', () => {
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
  const { View } = require('react-native');
  const animation: Record<string, unknown> = {};
  animation.duration = () => animation;
  animation.delay = () => animation;
  animation.easing = () => animation;
  return {
    __esModule: true,
    default: { View },
    FadeIn: animation,
    FadeInDown: animation,
    FadeOut: animation,
    useReducedMotion: () => true,
    Easing: { bezier: () => 'bezier', out: () => 'out', in: () => 'in', inOut: () => 'inOut', cubic: 'cubic' },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('@/components/icons', () => new Proxy({}, { get: () => () => null }));

jest.mock('@/components/ui/GlassSurface', () => ({
  GlassSurface: ({ children }: { children?: React.ReactNode }) => require('react').createElement(
    require('react-native').View,
    null,
    children,
  ),
}));

jest.mock('@/components/ui', () => ({
  alpha: (color: string, opacity: number) => `${color}:${opacity}`,
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      accent: '#c8a55c',
      background: '#0a0a0a',
      backgroundElevated: '#181614',
      border: '#2c2823',
      text: '#f5f0e8',
      textHint: '#7d7368',
      textMuted: '#b9ad9e',
      textSubtle: '#8c8176',
    },
  }),
}));

jest.mock('@/hooks/useGuardedBack', () => ({ useGuardedBack: () => jest.fn() }));
jest.mock('@/hooks/usePremiumAccessPolicy', () => ({ usePremiumAccessPolicy: () => 'denied' }));

import { StreakBox } from '../StreakBox';
import StreakSettingsScreen from '../../app/streak-settings';
import { hasReadDevotionalToday } from '@/lib/home-devotional-state';
import { persistOnboardingFirstReading } from '@/lib/onboarding-first-reading';
import { flushUnfoldStorePersist, useUnfoldStore, type DevotionalDay } from '@/lib/store';

const SAMPLE_ID = 'onboarding-sample-streak-copy';
const STARTS_TOMORROW = 'Your streak starts with tomorrow’s reading.';

const firstDay: DevotionalDay = {
  dayNumber: 1,
  title: 'Synthetic First Reading',
  scriptureReference: 'Psalm 23:1',
  scriptureText: 'Synthetic scripture text.',
  bodyText: 'Synthetic devotional body.',
  quotableLine: 'Synthetic quotable line.',
  isRead: false,
};

function readFirstDevotionalInOnboarding() {
  expect(persistOnboardingFirstReading({ id: SAMPLE_ID, day: firstDay })).toBe(true);
  useUnfoldStore.getState().markDayAsRead(SAMPLE_ID, 1);
}

async function relaunch() {
  flushUnfoldStorePersist();
  await useUnfoldStore.persist.rehydrate();
}

function texts(tree: ReturnType<typeof renderer.create>): string[] {
  const { Text } = require('react-native');
  return tree.root.findAllByType(Text).map((node: { props: { children: unknown } }) => (
    ([] as unknown[]).concat(node.props.children).join('')
  ));
}

/** What Today renders: the store's streak and the store's read-today answer. */
function renderTodayRhythm() {
  const state = useUnfoldStore.getState();
  const hasReadToday = hasReadDevotionalToday({
    devotionals: state.devotionals,
    currentDevotionalId: state.currentDevotionalId,
  });
  let tree!: ReturnType<typeof renderer.create>;
  act(() => {
    tree = renderer.create(<StreakBox streakCount={state.streakCurrent} hasReadToday={hasReadToday} />);
  });
  const label = tree.root.findByProps({ accessibilityRole: 'button' }).props.accessibilityLabel as string;
  const rendered = { texts: texts(tree), label };
  act(() => tree.unmount());
  return rendered;
}

function renderStreakSettings() {
  let tree!: ReturnType<typeof renderer.create>;
  act(() => {
    tree = renderer.create(<StreakSettingsScreen />);
  });
  const rendered = texts(tree);
  act(() => tree.unmount());
  return rendered;
}

describe('streak copy after the onboarding devotional', () => {
  beforeEach(() => {
    useUnfoldStore.getState().reset();
    flushUnfoldStorePersist();
  });

  it('says the streak starts tomorrow on Today and in Streak Settings, before and after a relaunch', async () => {
    readFirstDevotionalInOnboarding();
    expect(useUnfoldStore.getState().streakCurrent).toBe(0);

    const todayBefore = renderTodayRhythm();
    const settingsBefore = renderStreakSettings();

    await relaunch();
    expect(useUnfoldStore.getState().streakCurrent).toBe(0);
    const todayAfter = renderTodayRhythm();
    const settingsAfter = renderStreakSettings();

    for (const today of [todayBefore, todayAfter]) {
      expect(today.texts).toContain(STARTS_TOMORROW);
      expect(today.texts).toContain('0');
      expect(today.texts).not.toContain('Begin with today’s reading.');
      expect(today.label).toContain(STARTS_TOMORROW);
      expect(today.label).not.toContain('Today is complete.');
    }
    for (const settings of [settingsBefore, settingsAfter]) {
      expect(settings).toContain(STARTS_TOMORROW);
      expect(settings).not.toContain('Start your streak by completing a devotional');
    }
    expect(todayAfter).toEqual(todayBefore);
    expect(settingsAfter).toEqual(settingsBefore);
  });

  // Streak Settings can stay mounted overnight. Yesterday's reading must not
  // keep the starts-tomorrow line once the local date moves on.
  it('drops the starts-tomorrow line in an open Streak Settings after local midnight', () => {
    jest.useFakeTimers({ now: new Date(2026, 4, 10, 23, 59, 50) });
    let tree!: ReturnType<typeof renderer.create>;
    try {
      readFirstDevotionalInOnboarding();
      act(() => {
        tree = renderer.create(<StreakSettingsScreen />);
      });
      expect(texts(tree)).toContain(STARTS_TOMORROW);

      act(() => {
        jest.advanceTimersByTime(20_000);
      });

      const afterMidnight = texts(tree);
      expect(afterMidnight).not.toContain(STARTS_TOMORROW);
      expect(afterMidnight).toContain('Start your streak by completing a devotional');
    } finally {
      act(() => tree?.unmount());
      jest.useRealTimers();
    }
  });

  it('keeps the begin-today copy for a reader with nothing read today', () => {
    const today = renderTodayRhythm();
    expect(today.texts).toContain('Begin with today’s reading.');
    expect(today.label).toContain('Today is not complete yet.');
    expect(renderStreakSettings()).toContain('Start your streak by completing a devotional');
  });
});
