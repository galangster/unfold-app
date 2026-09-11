/* eslint-disable import/first */
const mockRefreshRemoteConfig = jest.fn(async (..._args: unknown[]) => undefined);
const mockOnPermissionChanged = jest.fn(async (..._args: unknown[]) => undefined);
const mockRegisterPushToken = jest.fn();
const mockSyncTrialEnding = jest.fn(async (..._args: unknown[]) => undefined);
const mockGetPermissions = jest.fn();

jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  getItem: jest.fn(() => 'key'),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('expo-router', () => {
  const React = require('react');
  const Stack = ({ children }: { children?: unknown }) => children ?? null;
  function StackScreen() {
    return null;
  }
  Stack.Screen = StackScreen;
  return {
    Stack,
    usePathname: () => '/',
    useRootNavigationState: () => ({ key: 'root' }),
    useNavigationContainerRef: () => ({ current: null }),
    ThemeProvider: ({ children }: { children: unknown }) => children,
  };
});

jest.mock('expo-router/react-navigation', () => ({
  ThemeProvider: ({ children }: { children: unknown }) => children,
}));

jest.mock('@tanstack/react-query', () => ({
  QueryClient: class QueryClient {},
  QueryClientProvider: ({ children }: { children: unknown }) => children,
  onlineManager: { setEventListener: jest.fn() },
  focusManager: { setFocused: jest.fn() },
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: unknown }) => children,
}));

jest.mock('react-native-keyboard-controller', () => ({
  KeyboardProvider: ({ children }: { children: unknown }) => children,
}));

jest.mock('@/lib/mmkv-storage', () => ({
  isRecoverySession: () => false,
  getDeviceId: () => 'device-1',
}));

jest.mock('@/lib/device-credential', () => ({
  loadDeviceCredential: jest.fn(async () => undefined),
  ensureDeviceCredential: jest.fn(async () => null),
  clearDeviceCredential: jest.fn(async () => undefined),
  authenticatedFetch: (url: string, init?: RequestInit) => fetch(url, init),
  getCachedDeviceCredential: jest.fn(() => null),
}));

jest.mock('@/lib/sentry', () => ({
  initSentry: jest.fn(),
  registerNavigationContainer: jest.fn(),
  wrapRootComponent: (Component: unknown) => Component,
}));

jest.mock('@/lib/global-error-handler', () => ({
  installGlobalErrorHandler: jest.fn(),
  flushLastFatalBreadcrumb: jest.fn(),
}));

jest.mock('@/lib/crash-marker', () => ({
  armHealthyBootTimer: jest.fn(),
}));

jest.mock('@/lib/theme', () => ({
  ThemeProvider: ({ children }: { children: unknown }) => children,
  useTheme: () => ({
    colors: { background: '#000' },
    navigationTheme: {},
    isDark: true,
  }),
}));

jest.mock('@/hooks/useRevenueCatSync', () => ({ useRevenueCatSync: jest.fn() }));
jest.mock('@/hooks/useCheckInNotifications', () => ({ useCheckInNotifications: jest.fn() }));
jest.mock('@/hooks/useDailyReminderSync', () => ({ useDailyReminderSync: jest.fn() }));
jest.mock('@/hooks/useActReminderSync', () => ({ useActReminderSync: jest.fn() }));
jest.mock('@/hooks/useStreakReconcile', () => ({ useStreakReconcile: jest.fn() }));
jest.mock('@/hooks/useUserProfileSync', () => ({ useUserProfileSync: jest.fn() }));
jest.mock('@/hooks/useFullSyncPull', () => ({ useFullSyncPull: jest.fn() }));
jest.mock('@/hooks/useSyncOutboxDrain', () => ({ useSyncOutboxDrain: jest.fn() }));

jest.mock('@/lib/store', () => ({
  useUnfoldStore: Object.assign(
    (selector: (state: { user: { reminderTime: string; readingFont: string } }) => unknown) =>
      selector({ user: { reminderTime: '', readingFont: 'source-serif' } }),
    { getState: () => ({ clearResumeContext: jest.fn() }) },
  ),
}));

jest.mock('@/lib/reading-fonts-loader', () => ({ loadReadingFont: jest.fn() }));
jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/generation-migration', () => ({ migrateGenerationDataToServer: jest.fn(async () => undefined) }));
jest.mock('@/lib/widget-bridge', () => ({ endOrphanedReadingSessions: jest.fn() }));
jest.mock('@/lib/push-notification-helpers', () => ({
  shouldMarkNotificationNavigationReady: () => true,
}));

jest.mock('@/lib/push-notifications', () => ({
  registerPushToken: (...args: unknown[]) => mockRegisterPushToken(...args),
  setNotificationNavigationReady: jest.fn(),
  setupNotificationListeners: jest.fn(() => jest.fn()),
  syncNotificationPreferences: jest.fn(),
}));

jest.mock('@/lib/remote-config', () => ({
  refreshRemoteConfig: (...args: unknown[]) => mockRefreshRemoteConfig(...args),
}));

jest.mock('@/lib/notification-ask', () => ({
  onNotificationPermissionMaybeChanged: (...args: unknown[]) => mockOnPermissionChanged(...args),
}));

jest.mock('@/lib/trial-notification', () => ({
  syncTrialEndingNotification: (...args: unknown[]) => mockSyncTrialEnding(...args),
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissions(...args),
}));

jest.mock('@/components/onboarding/LaterEntryNotifySheet', () => ({
  LaterEntryNotifySheet: () => null,
}));
jest.mock('@/components/AudioPlayerOverlay', () => ({ AudioPlayerOverlay: () => null }));
jest.mock('@/components/PrivacyShield', () => ({ PrivacyShield: () => null }));
jest.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: unknown }) => children,
}));
jest.mock('@/components/RecoveryScreen', () => ({ RecoveryScreen: () => null }));

import React from 'react';
import { AppState } from 'react-native';
import { act, create } from 'react-test-renderer';

// RootLayout requires font binaries; jest has no asset transform, so stub each one.
jest.mock('../../../assets/fonts/PPEditorialNew-Light.otf', () => 1);
jest.mock('../../../assets/fonts/SourceSerifPro_400Regular.ttf', () => 1);
jest.mock('../../../assets/fonts/SourceSerifPro_400Regular_Italic.ttf', () => 1);
jest.mock('../../../assets/fonts/SourceSerifPro_600SemiBold.ttf', () => 1);
jest.mock('../../../assets/fonts/SourceSerifPro_700Bold.ttf', () => 1);
jest.mock('../../../assets/fonts/Inter_400Regular.ttf', () => 1);
jest.mock('../../../assets/fonts/Inter_400Regular_Italic.ttf', () => 1);
jest.mock('../../../assets/fonts/Inter_500Medium.ttf', () => 1);
jest.mock('../../../assets/fonts/Inter_600SemiBold.ttf', () => 1);
jest.mock('../../../assets/fonts/Inter_700Bold.ttf', () => 1);


const listeners: Array<(status: string) => void> = [];
const addEventListener = AppState.addEventListener as unknown as jest.Mock;

describe('G11 layout AppState reconcile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listeners.length = 0;
    addEventListener.mockImplementation((_event: string, listener: (status: string) => void) => {
      listeners.push(listener);
      return { remove: jest.fn() };
    });
  });

  it('refreshes config and reconciles permission on mount and AppState active', async () => {
    const RootLayout = require('@/app/_layout').default as () => React.ReactElement;
    await act(async () => {
      create(<RootLayout />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockRefreshRemoteConfig).toHaveBeenCalled();
    expect(mockOnPermissionChanged).toHaveBeenCalled();

    mockRefreshRemoteConfig.mockClear();
    mockOnPermissionChanged.mockClear();
    await act(async () => {
      listeners.forEach((listener) => listener('active'));
    });
    expect(mockRefreshRemoteConfig).toHaveBeenCalled();
    expect(mockOnPermissionChanged).toHaveBeenCalled();
  });
});
