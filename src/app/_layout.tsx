import { ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
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
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Lazy import auth to avoid crash if Firebase isn't installed
let useAuth: (() => void) | undefined;
try {
  const authModule = require('@/hooks/useAuth');
  useAuth = authModule.useAuth;
} catch {
  useAuth = undefined;
}

export const unstable_settings = {
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { colors, navigationTheme, isDark } = useTheme();

  // Initialize Firebase Auth and listen to auth state changes (if available)
  if (useAuth) {
    useAuth();
  }

  // Sync RevenueCat subscription status with Zustand store
  useRevenueCatSync();

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="style-onboarding" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="generating" />
        <Stack.Screen name="(onboarding)/sign-in" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="(main)" options={{ headerShown: false }} />
        <Stack.Screen
          name="paywall"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'InstrumentSerif_400Regular': require('@expo-google-fonts/instrument-serif/400Regular/InstrumentSerif_400Regular.ttf'),
    'InstrumentSerif_400Regular_Italic': require('@expo-google-fonts/instrument-serif/400Regular_Italic/InstrumentSerif_400Regular_Italic.ttf'),
    'SourceSerifPro_400Regular': require('@expo-google-fonts/source-serif-pro/SourceSerifPro_400Regular.ttf'),
    'SourceSerifPro_400Regular_Italic': require('@expo-google-fonts/source-serif-pro/SourceSerifPro_400Regular_Italic.ttf'),
    'SourceSerifPro_600SemiBold': require('@expo-google-fonts/source-serif-pro/SourceSerifPro_600SemiBold.ttf'),
    'SourceSerifPro_700Bold': require('@expo-google-fonts/source-serif-pro/SourceSerifPro_700Bold.ttf'),
    'JetBrainsMono_400Regular': require('@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf'),
    'JetBrainsMono_500Medium': require('@expo-google-fonts/jetbrains-mono/500Medium/JetBrainsMono_500Medium.ttf'),
    'Inter_400Regular': require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
    'Inter_400Regular_Italic': require('@expo-google-fonts/inter/400Regular_Italic/Inter_400Regular_Italic.ttf'),
    'Inter_500Medium': require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
    'Inter_600SemiBold': require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
    'Inter_700Bold': require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
    // Reading fonts (premium)
    'EBGaramond_400Regular': require('@expo-google-fonts/eb-garamond/400Regular/EBGaramond_400Regular.ttf'),
    'EBGaramond_400Regular_Italic': require('@expo-google-fonts/eb-garamond/400Regular_Italic/EBGaramond_400Regular_Italic.ttf'),
    'EBGaramond_600SemiBold': require('@expo-google-fonts/eb-garamond/600SemiBold/EBGaramond_600SemiBold.ttf'),
    'EBGaramond_700Bold': require('@expo-google-fonts/eb-garamond/700Bold/EBGaramond_700Bold.ttf'),
    'Lora_400Regular': require('@expo-google-fonts/lora/400Regular/Lora_400Regular.ttf'),
    'Lora_400Regular_Italic': require('@expo-google-fonts/lora/400Regular_Italic/Lora_400Regular_Italic.ttf'),
    'Lora_600SemiBold': require('@expo-google-fonts/lora/600SemiBold/Lora_600SemiBold.ttf'),
    'Lora_700Bold': require('@expo-google-fonts/lora/700Bold/Lora_700Bold.ttf'),
    'CrimsonText_400Regular': require('@expo-google-fonts/crimson-text/400Regular/CrimsonText_400Regular.ttf'),
    'CrimsonText_400Regular_Italic': require('@expo-google-fonts/crimson-text/400Regular_Italic/CrimsonText_400Regular_Italic.ttf'),
    'CrimsonText_600SemiBold': require('@expo-google-fonts/crimson-text/600SemiBold/CrimsonText_600SemiBold.ttf'),
    'CrimsonText_700Bold': require('@expo-google-fonts/crimson-text/700Bold/CrimsonText_700Bold.ttf'),
    'Merriweather_400Regular': require('@expo-google-fonts/merriweather/400Regular/Merriweather_400Regular.ttf'),
    'Merriweather_400Regular_Italic': require('@expo-google-fonts/merriweather/400Regular_Italic/Merriweather_400Regular_Italic.ttf'),
    'Merriweather_700Bold': require('@expo-google-fonts/merriweather/700Bold/Merriweather_700Bold.ttf'),
    'Merriweather_900Black': require('@expo-google-fonts/merriweather/900Black/Merriweather_900Black.ttf'),
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
