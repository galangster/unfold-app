/* eslint-disable import/first */
import React from 'react';
import { Alert } from 'react-native';

const renderer = jest.requireActual('react-test-renderer');
const { act } = renderer;

const mockIsQaToolsEnabled = jest.fn(() => true);
const mockSimulateTrialPurchase = jest.fn((..._args: unknown[]) => ({ ok: true }));
const mockResolveLaterEntryExit = jest.fn((..._args: unknown[]) => ({ kind: 'auto', intent: { intentId: 'intent-1' } }));
const mockPush = jest.fn();

jest.mock('react-native-gesture-handler', () => {
  const { TouchableOpacity } = jest.requireActual('react-native');
  return { TouchableOpacity };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ colors: { accent: '#c8a55c' } }),
}));

jest.mock('@/lib/qa-tools', () => ({
  isQaToolsEnabled: () => mockIsQaToolsEnabled(),
  shouldRenderQaChrome: () => mockIsQaToolsEnabled(),
}));

jest.mock('@/lib/qa-simulated-trial', () => ({
  QA_TRIAL_LENGTH_OPTIONS: [
    { label: '3-day trial', trialLengthMs: 259_200_000 },
    { label: '7-day trial', trialLengthMs: 604_800_000 },
    { label: 'Sandbox trial (3 min)', trialLengthMs: 180_000 },
  ],
  simulateTrialPurchase: (...args: unknown[]) => mockSimulateTrialPurchase(...args),
}));

jest.mock('@/lib/auto-trial-exit', () => ({
  resolveLaterEntryExit: (...args: unknown[]) => mockResolveLaterEntryExit(...args),
}));

jest.mock('@/lib/store', () => {
  const state = {
    user: { themeMode: 'dark' },
    updateUser: jest.fn(),
    setHasSeenHomeTooltips: jest.fn(),
    addDevotional: jest.fn(),
    setCurrentDevotional: jest.fn(),
    devotionals: [],
    currentDevotionalId: null,
  };
  const useUnfoldStore = (selector: (value: typeof state) => unknown) => selector(state);
  useUnfoldStore.getState = () => state;
  return { useUnfoldStore, ThemeMode: {} };
});

jest.mock('@/lib/ui-state', () => ({
  useUIState: (selector: (value: Record<string, unknown>) => unknown) => selector({
    debugForceTrialExpired: false,
    setDebugForceTrialExpired: jest.fn(),
    qaPremiumOverride: false,
    setQaPremiumOverride: jest.fn(),
    setRevenueCatResolved: jest.fn(),
  }),
}));

jest.mock('@/lib/trial-notification', () => ({
  debugFireTrialEndingNotification: jest.fn(async () => 'id'),
}));

jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: { removeItem: jest.fn() },
}));

jest.mock('@/lib/notifications', () => ({
  scheduleDevotionalReadyTapTestNotification: jest.fn(async () => false),
}));

jest.mock('@/lib/dev-seed', () => ({
  buildDevotionalSeed: jest.fn(() => ({
    id: 'seed',
    title: 'Quiet Path Series',
    totalDays: 3,
    currentDay: 1,
    days: [{ title: 'Day 1' }],
  })),
}));

jest.mock('../SettingsSectionHeader', () => ({
  SettingsSectionHeader: () => null,
}));

import { QaToolsSection } from '../QaToolsSection';

function createSection() {
  let tree: { root: { findAll: (fn: (n: { props?: Record<string, unknown> }) => boolean) => { props: Record<string, unknown> }[] }; unmount: () => void };
  act(() => {
    tree = renderer.create(<QaToolsSection />);
  });
  return tree!;
}

describe('L3 QaToolsSection simulate trial row', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsQaToolsEnabled.mockReturnValue(true);
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('P4 renders no simulate row when QA tools are off', () => {
    mockIsQaToolsEnabled.mockReturnValue(false);
    const tree = createSection();
    expect(tree.root.findAll((node) => (
      typeof node.props?.children === 'string'
      && String(node.props.children).includes('Simulate Trial Purchase')
    ))).toHaveLength(0);
  });

  it('passes the chosen trialLengthMs into simulateTrialPurchase', () => {
    const tree = createSection();
    const row = tree.root.findAll((node) => (
      node.props?.accessibilityLabel === 'Simulate Trial Purchase (Dev)'
    ))[0];
    expect(row).toBeDefined();
    act(() => {
      (row.props.onPress as () => void)();
    });
    expect(alertSpy).toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    const threeDay = buttons.find((button) => button.text === '3-day trial');
    expect(threeDay).toBeDefined();
    act(() => {
      threeDay!.onPress?.();
    });
    expect(mockSimulateTrialPurchase).toHaveBeenCalledWith(expect.objectContaining({
      trialLengthMs: 259_200_000,
    }));
  });
});
