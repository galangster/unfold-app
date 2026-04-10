import { ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack, useNavigationContainerRef } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Application from 'expo-application';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useFonts } from 'expo-font';

import { ClerkProvider, ClerkLoaded, useAuth as useClerkAuth } from '@clerk/clerk-expo';
import { tokenCache, setTokenGetter } from '@/lib/clerk';
import { Colors } from '@/constants/colors';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { useRevenueCatSync } from '@/hooks/useRevenueCatSync';
import { useCheckInNotifications } from '@/hooks/useCheckInNotifications';
import { useAuth } from '@/hooks/useAuth';
import { useUnfoldStore } from '@/lib/store';
import { registerPushToken, setupNotificationListeners } from '@/lib/push-notifications';
import { syncService } from '@/lib/sync-service';
import { migrateGenerationDataToServer } from '@/lib/generation-migration';
import { ErrorBoundary } from '@/components/ErrorBoundary';
// GlowBackground disabled — 18 infinite Reanimated animations saturate the main thread,
// blocking touch events and causing audio playback freezes. See GlowBackground.tsx for details.
// import { GlowBackground } from '@/components/GlowBackground';
import { AudioPlayerOverlay } from '@/components/AudioPlayerOverlay';

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
  release: `unfold@${Application.nativeApplicationVersion ?? '1.0.0'}`,
  dist: Application.nativeBuildVersion ?? '1',

  // Performance: 20% of transactions in production, 5% profiled
  tracesSampleRate: __DEV__ ? 0 : 0.2,
  profilesSampleRate: __DEV__ ? 0 : 0.05,

  // Attach screenshots and view hierarchy on crash
  attachScreenshot: true,
  attachViewHierarchy: true,
  sendDefaultPii: false,
  enableCaptureFailedRequests: true,
  maxBreadcrumbs: 100,

  integrations: [
    navigationIntegration,
    Sentry.mobileReplayIntegration(),
    Sentry.httpClientIntegration(),
    Sentry.feedbackIntegration(),
  ],

  // Session Replay — capture 10% of sessions, 100% on error
  replaysSessionSampleRate: __DEV__ ? 0 : 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Defense-in-depth: strip any PII that leaks through
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
    }
    return event;
  },
});

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
  const ref = useNavigationContainerRef();

  // Sync Clerk token getter to module-level ref for non-React service files
  const { getToken } = useClerkAuth();
  useEffect(() => {
    setTokenGetter(getToken);
  }, [getToken]);

  // Auth state — syncs Clerk to Zustand, RevenueCat, Sentry
  const { userId, email, authProvider } = useAuth();

  // Start/stop cloud sync service based on auth state
  useEffect(() => {
    if (userId) {
      syncService.start();
      return () => syncService.stop();
    }
  }, [userId]);

  // Sync RevenueCat subscription status with Zustand store
  useRevenueCatSync();

  // Schedule/cancel midday check-in and evening wind-down notifications
  useCheckInNotifications();

  // Register push token with backend and listen for notification taps
  useEffect(() => {
    if (userId) {
      registerPushToken();
    }
  }, [userId]);

  useEffect(() => {
    const cleanup = setupNotificationListeners();
    return cleanup;
  }, []);

  // One-time migration of local generation data to server
  useEffect(() => {
    migrateGenerationDataToServer().catch(() => {});
  }, []);

  const isPremium = useUnfoldStore((s) => s.user?.isPremium ?? false);

  // Register navigation container with Sentry for screen tracking
  useEffect(() => {
    if (ref) {
      navigationIntegration.registerNavigationContainer(ref);
    }
  }, [ref]);

  // Set Sentry user context when auth state changes
  useEffect(() => {
    if (userId) {
      Sentry.setUser({ id: userId });
      Sentry.setTag('auth_provider', authProvider ?? 'none');
      Sentry.setTag('is_premium', String(isPremium));
    } else {
      Sentry.setUser(null);
    }
  }, [userId, email, authProvider, isPremium]);


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
        <Stack.Screen
          name="(onboarding)/sign-in"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
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
        </Stack>
        <AudioPlayerOverlay />
      </View>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavigationThemeProvider>
  );
}

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'InstrumentSerif_400Regular': require('../../assets/fonts/InstrumentSerif_400Regular.ttf'),
    'InstrumentSerif_400Regular_Italic': require('../../assets/fonts/InstrumentSerif_400Regular_Italic.ttf'),
    'SourceSerifPro_400Regular': require('../../assets/fonts/SourceSerifPro_400Regular.ttf'),
    'SourceSerifPro_400Regular_Italic': require('../../assets/fonts/SourceSerifPro_400Regular_Italic.ttf'),
    'SourceSerifPro_600SemiBold': require('../../assets/fonts/SourceSerifPro_600SemiBold.ttf'),
    'SourceSerifPro_700Bold': require('../../assets/fonts/SourceSerifPro_700Bold.ttf'),
    'JetBrainsMono_400Regular': require('../../assets/fonts/JetBrainsMono_400Regular.ttf'),
    'JetBrainsMono_500Medium': require('../../assets/fonts/JetBrainsMono_500Medium.ttf'),
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
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY!} tokenCache={tokenCache}>
      <ClerkLoaded>
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
      </ClerkLoaded>
    </ClerkProvider>
  );
}

export default Sentry.wrap(RootLayout);
