import { ThemeProvider as NavigationThemeProvider } from 'expo-router/react-navigation';
import { Stack, usePathname, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useFonts } from 'expo-font';

import { Colors } from '@/constants/colors';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { useRevenueCatSync } from '@/hooks/useRevenueCatSync';
import { useCheckInNotifications } from '@/hooks/useCheckInNotifications';
import { useDailyReminderSync } from '@/hooks/useDailyReminderSync';
import { useStreakReconcile } from '@/hooks/useStreakReconcile';
import { useUserProfileSync } from '@/hooks/useUserProfileSync';
import { useSyncOutboxDrain } from '@/hooks/useSyncOutboxDrain';
import { logger } from '@/lib/logger';
import { useUnfoldStore } from '@/lib/store';
import { registerPushToken, setNotificationNavigationReady, setupNotificationListeners, syncNotificationPreferences } from '@/lib/push-notifications';
import { shouldMarkNotificationNavigationReady } from '@/lib/push-notification-helpers';
import { migrateGenerationDataToServer } from '@/lib/generation-migration';
import { ErrorBoundary } from '@/components/ErrorBoundary';
// GlowBackground disabled — 18 infinite Reanimated animations saturate the main thread,
// blocking touch events and causing audio playback freezes. See GlowBackground.tsx for details.
// import { GlowBackground } from '@/components/GlowBackground';
import { AudioPlayerOverlay } from '@/components/AudioPlayerOverlay';

export const unstable_settings = {
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

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

function RootLayoutNav() {
  const { colors, navigationTheme, isDark } = useTheme();
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const reminderTime = useUnfoldStore((s) => s.user?.reminderTime ?? '');

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

  // Drain the sync outbox on mount and on reconnect so offline completions
  // reach the server when connectivity returns.
  useSyncOutboxDrain();

  // Register push token with backend (anonymous, keyed by X-Device-ID)
  useEffect(() => {
    registerPushToken();
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

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* GlowBackground disabled — infinite Reanimated animations block JS thread */}
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
          name="debug-light-mode"
          options={{
            animation: 'slide_from_right',
            gestureEnabled: true,
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
      </View>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavigationThemeProvider>
  );
}

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Gupter_400Regular': require('../../assets/fonts/Gupter_400Regular.ttf'),
    'Gupter_500Medium': require('../../assets/fonts/Gupter_500Medium.ttf'),
    'Gupter_700Bold': require('../../assets/fonts/Gupter_700Bold.ttf'),
    'SourceSerifPro_400Regular': require('../../assets/fonts/SourceSerifPro_400Regular.ttf'),
    'SourceSerifPro_400Regular_Italic': require('../../assets/fonts/SourceSerifPro_400Regular_Italic.ttf'),
    'SourceSerifPro_600SemiBold': require('../../assets/fonts/SourceSerifPro_600SemiBold.ttf'),
    'SourceSerifPro_700Bold': require('../../assets/fonts/SourceSerifPro_700Bold.ttf'),
    'Inter_400Regular': require('../../assets/fonts/Inter_400Regular.ttf'),
    'Inter_400Regular_Italic': require('../../assets/fonts/Inter_400Regular_Italic.ttf'),
    'Inter_500Medium': require('../../assets/fonts/Inter_500Medium.ttf'),
    'Inter_600SemiBold': require('../../assets/fonts/Inter_600SemiBold.ttf'),
    'Inter_700Bold': require('../../assets/fonts/Inter_700Bold.ttf'),
    // Reading fonts (premium)
    'EBGaramond_400Regular': require('../../assets/fonts/EBGaramond_400Regular.ttf'),
    'EBGaramond_400Regular_Italic': require('../../assets/fonts/EBGaramond_400Regular_Italic.ttf'),
    'EBGaramond_600SemiBold': require('../../assets/fonts/EBGaramond_600SemiBold.ttf'),
    'EBGaramond_700Bold': require('../../assets/fonts/EBGaramond_700Bold.ttf'),
    'Lora_400Regular': require('../../assets/fonts/Lora_400Regular.ttf'),
    'Lora_400Regular_Italic': require('../../assets/fonts/Lora_400Regular_Italic.ttf'),
    'Lora_600SemiBold': require('../../assets/fonts/Lora_600SemiBold.ttf'),
    'Lora_700Bold': require('../../assets/fonts/Lora_700Bold.ttf'),
    'CrimsonText_400Regular': require('../../assets/fonts/CrimsonText_400Regular.ttf'),
    'CrimsonText_400Regular_Italic': require('../../assets/fonts/CrimsonText_400Regular_Italic.ttf'),
    'CrimsonText_600SemiBold': require('../../assets/fonts/CrimsonText_600SemiBold.ttf'),
    'CrimsonText_700Bold': require('../../assets/fonts/CrimsonText_700Bold.ttf'),
    'Merriweather_400Regular': require('../../assets/fonts/Merriweather_400Regular.ttf'),
    'Merriweather_400Regular_Italic': require('../../assets/fonts/Merriweather_400Regular_Italic.ttf'),
    'Merriweather_700Bold': require('../../assets/fonts/Merriweather_700Bold.ttf'),
    'Merriweather_900Black': require('../../assets/fonts/Merriweather_900Black.ttf'),
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
    <ErrorBoundary>
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
