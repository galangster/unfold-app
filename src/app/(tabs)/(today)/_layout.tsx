import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useUnfoldStore, useHasHydrated } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import { useTheme } from '@/lib/theme';
import { TrialExpiredOverlay } from '@/components/TrialExpiredOverlay';

export default function TodayLayout() {
  // Wait for persisted state before deciding anything. Zustand's MMKV
  // adapter is synchronous but persist() still rehydrates async, so on
  // cold launch the first render sees `user === undefined` and any
  // `?? true` fallback would briefly let gated content through. See
  // ~/vault/standards/navigation-in-render-not-effects.md
  const hasHydrated = useHasHydrated();
  const { colors } = useTheme();

  const isPremiumReal = useUnfoldStore((s) => s.user?.isPremium ?? false);
  const hasCompletedOnboarding = useUnfoldStore((s) => s.user?.hasCompletedOnboarding ?? false);
  const debugForceTrialExpired = useUIState((s) => s.debugForceTrialExpired);
  const isPremium = debugForceTrialExpired ? false : __DEV__ ? true : isPremiumReal;
  const shouldShowOverlay = !isPremium && hasCompletedOnboarding;

  if (!hasHydrated) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  // Render the stack + overlay as siblings. If isPremium flips at runtime
  // (RevenueCat sync, debug toggle), the overlay layers on top *without*
  // unmounting the stack — journal drafts, note editor content, SOAP
  // answers all survive. The stack is pointerEvents-none'd out while the
  // overlay is visible to prevent interaction with hidden screens.
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        pointerEvents={shouldShowOverlay ? 'none' : 'auto'}
        importantForAccessibility={shouldShowOverlay ? 'no-hide-descendants' : 'auto'}
        aria-hidden={shouldShowOverlay}
      >
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
            animation: 'ios_from_right',
            animationDuration: 280,
          }}
        >
          <Stack.Screen name="index" options={{ animation: 'fade' }} />
          <Stack.Screen name="reading" options={{ animation: 'fade' }} />
          <Stack.Screen name="journal" options={{ animation: 'ios_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
          <Stack.Screen name="journal-detail" options={{ animation: 'ios_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
          <Stack.Screen name="highlights" options={{ animation: 'ios_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
          <Stack.Screen
            name="evening-wind-down"
            options={{ animation: 'fade_from_bottom' }}
          />
          <Stack.Screen
            name="wallpaper"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="day-menu"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.5, 0.85],
              sheetGrabberVisible: true,
              sheetCornerRadius: 24,
              headerShown: false,
            }}
          />
        </Stack>
      </View>
      {shouldShowOverlay && (
        <View
          style={StyleSheet.absoluteFill}
          accessibilityViewIsModal
          importantForAccessibility="yes"
        >
          <TrialExpiredOverlay />
        </View>
      )}
    </View>
  );
}
