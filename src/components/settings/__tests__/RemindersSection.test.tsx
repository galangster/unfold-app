import React from 'react';
import { RemindersSection } from '../RemindersSection';
import { onNotificationPermissionMaybeChanged, resetNotificationAskBaseline } from '@/lib/notification-ask';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockCommitDailyReminderSetting = jest.fn();
const mockAreNotificationsEnabled = jest.fn();
const mockGetPermissionsAsync = jest.fn();
const mockSyncTrialEndingNotification = jest.fn();

jest.mock('@/constants/animations', () => ({
  Duration: { normal: 220 },
  Ease: { out: jest.fn() },
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: jest.fn(),
}));

jest.mock('@/lib/notifications', () => ({
  commitDailyReminderSetting: (...args: unknown[]) => mockCommitDailyReminderSetting(...args),
  areNotificationsEnabled: (...args: unknown[]) => mockAreNotificationsEnabled(...args),
  beginDailyReminderOperation: jest.fn(),
}));

jest.mock('@/lib/trial-notification', () => ({
  syncTrialEndingNotification: (...args: unknown[]) => mockSyncTrialEndingNotification(...args),
}));

jest.mock('@/lib/push-notifications', () => ({
  registerPushToken: jest.fn(async () => 'registered'),
}));

jest.mock('@/lib/auto-trial-telemetry', () => ({
  trackNotificationPermissionAnswered: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('react-native-gesture-handler', () => ({
  TouchableOpacity: require('react-native').TouchableOpacity,
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
  FadeIn: { duration: () => ({ easing: () => undefined }) },
  useReducedMotion: () => true,
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      text: '#F5F0EB',
      textMuted: 'rgba(245,240,235,0.6)',
      textSubtle: 'rgba(245,240,235,0.4)',
      background: '#0B0A09',
      buttonBackgroundPressed: 'rgba(245,240,235,0.12)',
      border: 'rgba(245,240,235,0.08)',
      inputBackground: '#141210',
      accent: '#C8A55C',
    },
    isDark: true,
  }),
}));

const mockUpdateUser = jest.fn();

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (
    selector: (state: {
      user: { reminderTime: string; dailyReminderEnabled: boolean };
      updateUser: jest.Mock;
      middayCheckInEnabled: boolean;
      eveningWindDownEnabled: boolean;
      setMiddayCheckInEnabled: jest.Mock;
      setEveningWindDownEnabled: jest.Mock;
      middayCheckInTime: string;
      eveningWindDownTime: string;
      devotionals: unknown[];
    }) => unknown,
  ) => selector({
    user: { reminderTime: '8:00 AM', dailyReminderEnabled: false },
    updateUser: mockUpdateUser,
    middayCheckInEnabled: false,
    eveningWindDownEnabled: false,
    setMiddayCheckInEnabled: jest.fn(),
    setEveningWindDownEnabled: jest.fn(),
    middayCheckInTime: '12:00 PM',
    eveningWindDownTime: '8:00 PM',
    devotionals: [],
  }),
}));

jest.mock('@/hooks/usePremiumAccessPolicy', () => ({
  usePremiumAccessPolicy: () => 'granted',
}));

jest.mock('@/lib/reminder-time-suggestion', () => ({
  suggestReminderTime: () => null,
}));

jest.mock('@/lib/analytics', () => ({
  logEvent: jest.fn(),
}));

jest.mock('../SettingsSectionHeader', () => ({
  SettingsSectionHeader: ({ label }: { label: string }) => label,
  getSettingsCardStyle: () => ({}),
}));

describe('G11 RemindersSection toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetNotificationAskBaseline();
    mockAreNotificationsEnabled.mockResolvedValue(false);
    mockCommitDailyReminderSetting.mockResolvedValue(true);
  });

  it('calls syncTrialEndingNotification once after a toggle grant', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'denied' });
    await onNotificationPermissionMaybeChanged();
    expect(mockSyncTrialEndingNotification).not.toHaveBeenCalled();

    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });

    let tree: { root: { findAll: (fn: (n: { props?: { accessibilityLabel?: string; onPress?: () => void } }) => boolean) => { props: { onPress: () => void } }[] }; unmount: () => void };
    await act(async () => {
      tree = renderer.create(<RemindersSection />);
      await Promise.resolve();
    });

    const toggle = tree!.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Daily reminders' && typeof n.props?.onPress === 'function',
    )[0];
    if (!toggle) throw new Error('Daily reminders toggle not found');

    await act(async () => {
      await toggle.props.onPress();
    });

    expect(mockCommitDailyReminderSetting).toHaveBeenCalled();
    expect(mockSyncTrialEndingNotification).toHaveBeenCalledTimes(1);
    tree!.unmount();
  });
});
