/**
 * RV-UI-4 (FAP-UI-1 / COR-6 regression): multi-field SOAP edits inside one
 * 800ms debounce window must ALL persist, and the store-change-triggered
 * resync effect must never clobber visible local state.
 *
 * The historical bug: the debounced save closure captured only the
 * last-edited field, so editing Scripture then Observation within 800ms
 * persisted only Observation — and the resync effect then overwrote the
 * local Scripture text with the store's stale value. This test drives the
 * REAL JournalScreen (real handleSoapChange/flushSoapSaves/resync effect,
 * real diffSoapWrites) against a reactive store, so a regression in any of
 * those layers fails it.
 */
import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';

// react-test-renderer types are not installed in this app; keep this aligned
// with the existing component-test pattern.
const renderer = require('react-test-renderer');
const { act } = renderer;

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ devotionalId: 'dev-1', dayNumber: '1' }),
  // Today-flow mount: closeJournal reads segments + the enclosing stack state.
  useSegments: () => ['(tabs)', '(today)', 'journal'],
  useNavigation: () => ({ getState: () => ({ index: 1, routes: [] }) }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('react-native-keyboard-controller', () => {
  const { ScrollView } = require('react-native');
  return { KeyboardAwareScrollView: ScrollView };
});

jest.mock('react-native-reanimated', () => {
  const { View, Text: RNText } = require('react-native');
  const chainable = () => {
    const anim: Record<string, unknown> = {};
    for (const method of ['duration', 'delay', 'easing', 'springify', 'damping', 'build']) {
      anim[method] = () => anim;
    }
    return anim;
  };
  return {
    __esModule: true,
    default: { View, Text: RNText, createAnimatedComponent: (c: unknown) => c },
    FadeIn: chainable(),
    FadeInDown: chainable(),
    FadeOut: chainable(),
    Easing: { out: () => 'out', in: () => 'in', inOut: () => 'inOut', cubic: 'cubic' },
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: () => ({}),
    withSpring: (value: unknown) => value,
    withTiming: (value: unknown) => value,
    withSequence: (value: unknown) => value,
    withDelay: (_delay: number, value: unknown) => value,
    interpolateColor: () => '#000000',
    useReducedMotion: () => true,
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('phosphor-react-native', () => ({
  XIcon: 'XIcon',
  CheckIcon: 'CheckIcon',
  SparkleIcon: 'SparkleIcon',
  LockIcon: 'LockIcon',
  CheckCircleIcon: 'CheckCircleIcon',
  CaretDownIcon: 'CaretDownIcon',
  CaretUpIcon: 'CaretUpIcon',
  BookOpenIcon: 'BookOpenIcon',
  ArrowRightIcon: 'ArrowRightIcon',
  EyeIcon: 'EyeIcon',
  HandsPrayingIcon: 'HandsPrayingIcon',
  PencilSimpleIcon: 'PencilSimpleIcon',
  PlusIcon: 'PlusIcon',
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: new Proxy(
      {},
      { get: (_target, prop) => (typeof prop === 'string' ? '#888888' : undefined) },
    ),
    isDark: true,
  }),
}));

jest.mock('@/lib/network-error-handler', () => ({
  isOnline: jest.fn(async () => true),
}));

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://api.example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
  sanitizeForPrompt: (value: string) => value,
}));

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true })),
  incrementRateLimit: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@/components/PremiumFeatureSheet', () => ({
  PremiumFeatureSheet: () => null,
}));

jest.mock('@/components/ExclusiveOfferSheet', () => ({
  ExclusiveOfferSheet: () => null,
}));

jest.mock('@/components/VoiceInputBar', () => ({
  VoiceInputBar: () => null,
}));

jest.mock('@/components/ui', () => ({
  alpha: (color: string) => color,
}));

jest.mock('@/hooks/useCreationGate', () => ({
  useCreationGate: () => ({ gate: () => true, showExclusiveOffer: false, dismissOffer: jest.fn() }),
}));

jest.mock('@/hooks/usePremiumAccessPolicy', () => ({
  usePremiumAccessPolicy: () => 'granted',
}));

// Reactive store mock built on real zustand so store writes re-render the
// screen — the resync effect only fires on a genuine store-driven re-render.
// Mutators mirror store.ts semantics (immutable map, per-field SOAP write).
jest.mock('@/lib/store', () => {
  const { create } = require('zustand');

  let entrySeq = 0;

  const useUnfoldStore = create((set: any, get: any) => ({
    devotionals: [
      {
        id: 'dev-1',
        title: 'Test Series',
        totalDays: 7,
        currentDay: 1,
        days: [
          {
            dayNumber: 1,
            title: 'Day 1',
            scriptureReference: 'Psalm 23',
            studyMethod: 'soap_journal',
            reflectionQuestions: [],
          },
        ],
      },
    ],
    journalEntries: [],
    getJournalEntry: (devotionalId: string, dayNumber: number) =>
      get().journalEntries.find(
        (e: any) => e.devotionalId === devotionalId && e.dayNumber === dayNumber,
      ),
    // Mirrors the store: one entry per (devotionalId, dayNumber), id returned.
    addJournalEntry: ({ devotionalId, dayNumber, content, journalMode }: any) => {
      const existing = get().journalEntries.find(
        (e: any) => e.devotionalId === devotionalId && e.dayNumber === dayNumber,
      );
      if (existing) return existing.id;
      const id = `entry-${++entrySeq}`;
      set((s: any) => ({
        journalEntries: [...s.journalEntries, { id, devotionalId, dayNumber, content, journalMode }],
      }));
      return id;
    },
    updateJournalEntry: (id: string, content: string) =>
      set((s: any) => ({
        journalEntries: s.journalEntries.map((e: any) => (e.id === id ? { ...e, content } : e)),
      })),
    updateJournalMode: (id: string, mode: string) =>
      set((s: any) => ({
        journalEntries: s.journalEntries.map((e: any) =>
          e.id === id ? { ...e, journalMode: mode } : e,
        ),
      })),
    updateSoapResponse: (id: string, field: string, value: string) =>
      set((s: any) => ({
        journalEntries: s.journalEntries.map((e: any) => {
          if (e.id !== id) return e;
          const soap =
            e.soapResponses ?? { scripture: '', observation: '', application: '', prayer: '' };
          return { ...e, soapResponses: { ...soap, [field]: value } };
        }),
      })),
    addPrayerRequest: jest.fn(),
    togglePrayerAnswered: jest.fn(),
    updateQuestionResponse: jest.fn(),
    setDeeperQuestions: jest.fn(),
    setResumeContext: jest.fn(),
  }));

  return { useUnfoldStore };
});

import JournalScreen from '../../app/(tabs)/(today)/journal';
import { useUnfoldStore } from '@/lib/store';

const SCRIPTURE_TEXT = 'The Lord is my shepherd';
const OBSERVATION_TEXT = 'He restores my soul';
const EXPECTED_SOAP = {
  scripture: SCRIPTURE_TEXT,
  observation: OBSERVATION_TEXT,
  application: '',
  prayer: '',
};

describe('SOAP multi-field debounce clobber regression (RV-UI-4)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('edits to A then B within 800ms both persist, and the resync effect never clobbers local state', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<JournalScreen />);
    });

    const soapInput = (label: string) =>
      tree.root.findAll(
        (node: any) => node.type === TextInput && node.props.accessibilityLabel === label,
      )[0];

    // Scripture starts expanded (fresh entry, no persisted soapResponses)
    expect(soapInput('Scripture journal entry')).toBeTruthy();
    act(() => {
      soapInput('Scripture journal entry').props.onChangeText(SCRIPTURE_TEXT);
    });

    // Stay inside the 800ms debounce window, then switch to Observation
    act(() => {
      jest.advanceTimersByTime(300);
    });
    const observationHeader = tree.root.findAll(
      (node: any) =>
        node.type === TouchableOpacity && node.props.accessibilityLabel === 'Observation section',
    )[0];
    act(() => {
      observationHeader.props.onPress();
    });
    act(() => {
      soapInput('Observation journal entry').props.onChangeText(OBSERVATION_TEXT);
    });

    // Nothing may persist before the debounce fires
    expect(useUnfoldStore.getState().journalEntries).toHaveLength(0);

    // Fire the (restarted) debounce → flush writes → store update → resync effect
    act(() => {
      jest.advanceTimersByTime(800);
    });

    // BOTH fields persisted — flush must write every pending field, not just
    // the last-edited one captured in the final timer closure.
    expect(useUnfoldStore.getState().journalEntries[0]?.soapResponses).toEqual(EXPECTED_SOAP);

    // Visible local state survived the store-change-triggered resync:
    // the expanded Observation input still holds its text...
    expect(soapInput('Observation journal entry').props.value).toBe(OBSERVATION_TEXT);
    // ...and the collapsed Scripture preview still shows its text.
    const scripturePreviews = tree.root
      .findAllByType(Text)
      .filter((node: any) => node.props.children === SCRIPTURE_TEXT);
    expect(scripturePreviews.length).toBeGreaterThan(0);

    // Let any straggling timers/effects run — they must not clobber either side.
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(soapInput('Observation journal entry').props.value).toBe(OBSERVATION_TEXT);
    expect(useUnfoldStore.getState().journalEntries[0]?.soapResponses).toEqual(EXPECTED_SOAP);

    act(() => tree.unmount());
  });
});
