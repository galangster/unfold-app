import { ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as Sentry from '@sentry/react-native';
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
import { useAuth } from '@/hooks/useAuth';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { GlowBackground } from '@/components/GlowBackground';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !__DEV__,
  tracesSampleRate: 0.2,
  environment: __DEV__ ? 'development' : 'production',
});

export const unstable_settings = {
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { colors, navigationTheme, isDark } = useTheme();

  // Initialize Firebase Auth and listen to auth state changes (always call hook unconditionally)
  useAuth();

  // Sync RevenueCat subscription status with Zustand store
  useRevenueCatSync();

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
        <GlowBackground color={colors.accent} intensity={0.6} emberCount={14} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
            animation: 'fade',
          }}
        >
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="how-it-works" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="onboarding" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="generating" options={{ animation: 'fade_from_bottom', gestureEnabled: false }} />
        <Stack.Screen
          name="(onboarding)/sign-in"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: '#0a0a0a' },
          }}
        />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'none' }} />
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
            contentStyle: { backgroundColor: '#0a0a0a' },
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
        </Stack>
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
      SplashScreen.hideAsync();
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

export default Sentry.wrap(RootLayout);
