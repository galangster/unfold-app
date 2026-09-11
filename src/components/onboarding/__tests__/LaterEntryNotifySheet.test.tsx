import React from 'react';
import type { CustomerInfo } from 'react-native-purchases';
import { LaterEntryNotifySheet } from '../LaterEntryNotifySheet';
import { useUIState } from '@/lib/ui-state';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockGetPermissionsAsync = jest.fn();
const mockRequestNotificationPermissions = jest.fn();
const mockRegisterPushToken = jest.fn();
const mockSyncTrialEndingNotification = jest.fn();
const mockReadTrialEntitlement = jest.fn();

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: jest.fn(),
}));

jest.mock('@/lib/notifications', () => ({
  requestNotificationPermissions: (...args: unknown[]) => mockRequestNotificationPermissions(...args),
}));

jest.mock('@/lib/push-notifications', () => ({
  registerPushToken: (...args: unknown[]) => mockRegisterPushToken(...args),
}));

jest.mock('@/lib/trial-notification', () => ({
  syncTrialEndingNotification: (...args: unknown[]) => mockSyncTrialEndingNotification(...args),
}));

jest.mock('@/lib/trial-facts', () => ({
  readTrialEntitlement: (...args: unknown[]) => mockReadTrialEntitlement(...args),
}));

jest.mock('@/lib/auto-trial-telemetry', () => ({
  trackNotificationPermissionAnswered: jest.fn(),
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    FadeIn: {},
  };
});

jest.mock('@/components/icons', () => ({
  BellIcon: () => null,
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      backgroundElevated: '#111214',
      border: '#24262B',
      textMuted: '#A0A6B1',
      textSubtle: '#7D8592',
    },
  }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));

const mounted: { unmount: () => void }[] = [];

function textOf(tree: { toJSON: () => unknown }) {
  return JSON.stringify(tree.toJSON());
}

async function waitFor(check: () => boolean, label: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (check()) return;
    // eslint-disable-next-line no-await-in-loop -- sequential settling is the point
    await act(async () => {
      for (let tick = 0; tick < 10; tick += 1) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
      }
    });
  }
  if (!check()) throw new Error(`Timed out waiting for: ${label}`);
}

function pressByLabel(tree: { root: { findAll: (fn: (n: { props?: { accessibilityLabel?: string; onPress?: () => void } }) => boolean) => { props: { onPress: () => void } }[] } }, label: string) {
  const node = tree.root.findAll(
    (n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function',
  )[0];
  if (!node) throw new Error(`No pressable found with accessibilityLabel "${label}"`);
  return act(async () => {
    node.props.onPress();
    await Promise.resolve();
  });
}

describe('G10 LaterEntryNotifySheet and requestLaterEntryNotifyAsk', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUIState.getState().setLaterEntryNotifyAskPending(false);
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestNotificationPermissions.mockResolvedValue(true);
    mockRegisterPushToken.mockResolvedValue('registered');
  });

  afterEach(async () => {
    await act(async () => {
      for (const tree of mounted.splice(0)) {
        tree.unmount();
      }
    });
    useUIState.getState().setLaterEntryNotifyAskPending(false);
  });

  it('sets the flag and shows the sheet for a TRIAL entitlement with undetermined permission; a grant syncs the trial notice', async () => {
    const { requestLaterEntryNotifyAsk, resetNotificationAskBaseline } = require('@/lib/notification-ask');
    resetNotificationAskBaseline();
    mockReadTrialEntitlement.mockReturnValue({ periodType: 'TRIAL' });

    let tree: { toJSON: () => unknown; root: { findAll: (fn: (n: { props?: { accessibilityLabel?: string; onPress?: () => void } }) => boolean) => { props: { onPress: () => void } }[] }; unmount: () => void };
    await act(async () => {
      tree = renderer.create(<LaterEntryNotifySheet />);
    });
    mounted.push(tree!);

    expect(textOf(tree!)).not.toContain('Notify me');

    await act(async () => {
      await requestLaterEntryNotifyAsk({ entitlements: { active: {} } } as CustomerInfo);
    });

    expect(useUIState.getState().laterEntryNotifyAskPending).toBe(true);
    await waitFor(() => textOf(tree!).includes('Notify me'), 'the later-entry sheet to show');

    await pressByLabel(tree!, 'Notify me');
    await waitFor(() => mockSyncTrialEndingNotification.mock.calls.length > 0, 'grant effects');

    expect(mockSyncTrialEndingNotification).toHaveBeenCalledTimes(1);
    expect(useUIState.getState().laterEntryNotifyAskPending).toBe(false);
  });

  it('does not set the flag for a NORMAL entitlement or granted permission', async () => {
    const { requestLaterEntryNotifyAsk } = require('@/lib/notification-ask');

    mockReadTrialEntitlement.mockReturnValue({ periodType: 'NORMAL' });
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    await requestLaterEntryNotifyAsk({ entitlements: { active: {} } } as CustomerInfo);
    expect(useUIState.getState().laterEntryNotifyAskPending).toBe(false);

    mockReadTrialEntitlement.mockReturnValue({ periodType: 'TRIAL' });
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
    await requestLaterEntryNotifyAsk({ entitlements: { active: {} } } as CustomerInfo);
    expect(useUIState.getState().laterEntryNotifyAskPending).toBe(false);
  });
});
