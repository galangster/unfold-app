import { ThemeProvider as NavigationThemeProvider } from 'expo-router/react-navigation';
import { Stack, usePathname, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider, onlineManager, focusManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useEffect } from 'react';
import { AppState, Platform, Text as RNText, TextInput as RNTextInput, View } from 'react-native';
import { useFonts } from 'expo-font';

import { Colors } from '@/constants/colors';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { useRevenueCatSync } from '@/hooks/useRevenueCatSync';
import { useCheckInNotifications } from '@/hooks/useCheckInNotifications';
import { useDailyReminderSync } from '@/hooks/useDailyReminderSync';
import { useStreakReconcile } from '@/hooks/useStreakReconcile';
import { useUserProfileSync } from '@/hooks/useUserProfileSync';
import { useFullSyncPull } from '@/hooks/useFullSyncPull';
import { useSyncOutboxDrain } from '@/hooks/useSyncOutboxDrain';
import { logger } from '@/lib/logger';
import { useUnfoldStore } from '@/lib/store';
import { loadReadingFont } from '@/lib/reading-fonts-loader';
import { registerPushToken, setNotificationNavigationReady, setupNotificationListeners, syncNotificationPreferences } from '@/lib/push-notifications';
import { shouldMarkNotificationNavigationReady } from '@/lib/push-notification-helpers';
import { migrateGenerationDataToServer } from '@/lib/generation-migration';
import { endOrphanedReadingSessions } from '@/lib/widget-bridge';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { installGlobalErrorHandler } from '@/lib/global-error-handler';
import { armHealthyBootTimer } from '@/lib/crash-marker';
import { AudioPlayerOverlay } from '@/components/AudioPlayerOverlay';
import { PrivacyShield } from '@/components/PrivacyShield';

export const unstable_settings = {
  initialRouteName: 'index',
};

// Global Dynamic Type ceiling (FEEL-05): at the largest accessibility text sizes,
// uncapped scaling fragmented glyphs and broke layouts (Journal title/segmented
// control, Companion chrome). Cap the multiplier so text still scales generously
// for accessibility but layouts stay intact. No effect at default/XXL sizes
// (multiplier < 1.8); only bounds the AX range. The reading view sets its own
// explicit type sizes and is unaffected. Per-element overrides can raise/lower this.
const MAX_FONT_SCALE = 1.8;
// @ts-expect-error defaultProps is the RN-supported global default for these host components
RNText.defaultProps = { ...(RNText.defaultProps ?? {}), maxFontSizeMultiplier: MAX_FONT_SCALE };
// @ts-expect-error same for TextInput
RNTextInput.defaultProps = { ...(RNTextInput.defaultProps ?? {}), maxFontSizeMultiplier: MAX_FONT_SCALE };

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Fatal JS errors never reach the error boundary. Record them (bug log + boot
// crash-loop marker) before RN's own handler runs; no-op on web/jest where
// ErrorUtils is absent. A launch that stays up for the healthy window without
// crashing clears the boot crash count.
installGlobalErrorHandler();
armHealthyBootTimer();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// NET-7: Wire TanStack Query's onlineManager and focusManager for React Native.
// Without this, react-query has no visibility into network state changes, so
// stale queries (RC offerings, user profile, etc.) never refetch on reconnect.
// refetchOnWindowFocus stays false — this primarily enables refetch-on-reconnect.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) =>
    setOnline(Boolean(state.isConnected && state.isInternetReachable !== false))));
AppState.addEventListener('change', (status) => {
  if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
});

function RootLayoutNav() {
  const { colors, navigationTheme, isDark } = useTheme();
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const reminderTime = useUnfoldStore((s) => s.user?.reminderTime ?? '');
  const readingFontId = useUnfoldStore((s) => s.user?.readingFont);

  // PERF (cold start): non-default reading families are not in the
  // splash-blocking useFonts call. The persisted store hydrates synchronously
  // (MMKV reads are sync), so the user's choice is already known on the first
  // render here — but this effect also covers async rehydration and every
  // in-app switch site (Settings picker, reader's ReadingSettingsSheet),
  // because it keys off the store value rather than the switching component.
  // Non-blocking: text renders in Source Serif until the family arrives.
  useEffect(() => {
    void loadReadingFont(readingFontId);
  }, [readingFontId]);

  // Sync RevenueCat subscription status with Zustand store
  useRevenueCatSync();

  // Schedule/cancel midday check-in and evening wind-down notifications
  useCheckInNotifications();

  // Keep the 8am daily reminder payload fresh as devotional state changes.
  // Without this, the iOS/Android recurring trigger fires stale copy forever.
  useDailyReminderSync();

  // Reconcile streak state on hydration + foreground so stale persisted values
  // don't survive missed days until the next reading completion.
  useStreakReconcile();

  // Keep backend sync_users profile/preferences current so Day 2+ generation
  // uses Settings edits such as writing style and faith background.
  useUserProfileSync();

  // Pull all user-owned sync tables incrementally on app start/reconnect.
  useFullSyncPull();

  // Drain the sync outbox on mount and on reconnect so offline completions
  // reach the server when connectivity returns.
  useSyncOutboxDrain();

  // Register push token with backend (anonymous, keyed by X-Device-ID).
  // Also re-attempts on foreground so the POST succeeds after any earlier
  // failure (network down at cold start, permission granted during session).
  // The session-dedupe flag in registerPushToken makes foreground retries free
  // after the first successful POST.
  useEffect(() => {
    registerPushToken();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void registerPushToken();
    });
    return () => sub.remove();
  }, []);

  // Keep backend-side devotional-ready push timing aligned with the user's
  // current reminder preference, not just the initial token-registration time.
  useEffect(() => {
    if (!reminderTime) return;
    syncNotificationPreferences();
  }, [reminderTime]);

  useEffect(() => {
    const cleanup = setupNotificationListeners();
    return cleanup;
  }, []);

  useEffect(() => {
    // Cold-start notification routing needs both a concrete pathname AND a
    // mounted root navigation state. Pathname alone can become truthy before
    // the native stack is ready to honor a replace(), causing the queued route
    // to be lost and the app to settle on Home.
    const ready = shouldMarkNotificationNavigationReady({
      pathname,
      rootNavigationKey: rootNavigationState?.key,
    });
    logger.log('[push] notification navigation readiness', {
      pathname,
      rootNavigationKey: rootNavigationState?.key,
      ready,
    });
    setNotificationNavigationReady(ready);
  }, [pathname, rootNavigationState?.key]);

  // One-time migration of local generation data to server
  useEffect(() => {
    migrateGenerationDataToServer().catch(() => {});
  }, []);

  // NAT-5: sweep reading-session Live Activities orphaned by a previous app
  // run (app killed mid-session loses the JS ref, so the lock-screen activity
  // otherwise lingers indefinitely).
  useEffect(() => {
    if (Platform.OS === 'ios') endOrphanedReadingSessions();
  }, []);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'fade',
          }}
        >
        <Stack.Screen name="index" options={{ animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
        <Stack.Screen name="how-it-works" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="onboarding" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
        <Stack.Screen name="generating" options={{ animation: 'fade_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'none', gestureEnabled: false, contentStyle: { backgroundColor: 'transparent' } }} />
        <Stack.Screen
          name="share-card"
          options={{
            presentation: 'modal',
            headerShown: false,
            contentStyle: { backgroundColor: '#000000' },
          }}
        />
        <Stack.Screen
          name="paywall"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
            // Opaque modal surface (like share-card) so the paywall can never
            // bleed through the transparent (tabs) background if it lingers on
            // the nav stack.
            contentStyle: { backgroundColor: '#0A0A0A' },
          }}
        />
        <Stack.Screen
          name="reveal"
          options={{
            animation: 'fade',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="unfolded"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: '#0a0a0a' },
          }}
        />
        <Stack.Screen
          name="streak-settings"
          options={{
            animation: 'slide_from_right',
            gestureEnabled: true,
          }}
        />
        </Stack>
        <AudioPlayerOverlay />
        <PrivacyShield />
      </View>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavigationThemeProvider>
  );
}

/**
 * "Go to Today" from the error boundary. The boundary remounts its subtree
 * under a fresh key; the root Stack unmounted with the crashed subtree, which
 * cleared the navigation container's state, so the remount mounts a fresh
 * navigator at '/' and index routes a completed user to the Today tab. What
 * is cleared here is the app state that would steer that fresh navigator
 * straight back into the crash.
 */
function recoverToHome(): void {
  // A fresh resume context makes Today auto-open the reading screen.
  useUnfoldStore.getState().clearResumeContext();
}

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'PPEditorialNew-Light': require('../../assets/fonts/PPEditorialNew-Light.otf'),
    'SourceSerifPro_400Regular': require('../../assets/fonts/SourceSerifPro_400Regular.ttf'),
    'SourceSerifPro_400Regular_Italic': require('../../assets/fonts/SourceSerifPro_400Regular_Italic.ttf'),
    'SourceSerifPro_600SemiBold': require('../../assets/fonts/SourceSerifPro_600SemiBold.ttf'),
    'SourceSerifPro_700Bold': require('../../assets/fonts/SourceSerifPro_700Bold.ttf'),
    'Inter_400Regular': require('../../assets/fonts/Inter_400Regular.ttf'),
    'Inter_400Regular_Italic': require('../../assets/fonts/Inter_400Regular_Italic.ttf'),
    'Inter_500Medium': require('../../assets/fonts/Inter_500Medium.ttf'),
    'Inter_600SemiBold': require('../../assets/fonts/Inter_600SemiBold.ttf'),
    'Inter_700Bold': require('../../assets/fonts/Inter_700Bold.ttf'),
    // NOTE (PERF, cold start): the eager set is UI/display faces (PP Editorial New,
    // Inter) plus the DEFAULT reading family (Source Serif) only — 2.6 MB
    // instead of the 9.7 MB that blocked the splash when all six reading
    // families were listed here. Garamond / Lora / Crimson / Merriweather
    // (7.1 MB) load on demand via `@/lib/reading-fonts-loader`: from the
    // reading-font effect in RootLayoutNav and when the Settings font
    // picker opens. An unloaded family renders in the system fallback rather
    // than crashing, and `useReadingFont()` keeps serving Source Serif until
    // the requested family is registered, so there is no fallback-face flash
    // that never resolves.
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      // Wait one frame for the first render to paint before hiding splash
      // This prevents a white flash between splash dismissal and first JS frame
      requestAnimationFrame(() => {
        SplashScreen.hideAsync();
      });
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }} />
    );
  }

  return (
    <ErrorBoundary onNavigateHome={recoverToHome}>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.background }}>
          <KeyboardProvider>
            <ThemeProvider>
              <RootLayoutNav />
            </ThemeProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default RootLayout;
