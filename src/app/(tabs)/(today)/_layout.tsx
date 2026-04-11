import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useUnfoldStore, useHasHydrated } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import { useTheme } from '@/lib/theme';
import { TrialExpiredOverlay } from '@/components/TrialExpiredOverlay';

// Routes in this stack that are presented natively (iOS modal / formSheet)
// and therefore render ABOVE the React tree where the sibling overlay lives.
// When entitlement is lost we must dismiss these specifically — pushed
// in-stack routes (reading, journal, highlights, etc.) stay mounted so
// drafts and in-progress state are preserved behind the overlay.
const NATIVE_PRESENTED_ROUTES = new Set(['wallpaper', 'day-menu']);

export default function TodayLayout() {
  // Wait for persisted state before deciding anything. Zustand's MMKV
  // adapter is synchronous but persist() still rehydrates async, so on
  // cold launch the first render sees `user === undefined` and any
  // `?? true` fallback would briefly let gated content through. See
  // ~/vault/standards/navigation-in-render-not-effects.md
  const hasHydrated = useHasHydrated();
  const { colors } = useTheme();
  const router = useRouter();
  const segments = useSegments();

  const isPremiumReal = useUnfoldStore((s) => s.user?.isPremium ?? false);
  const hasCompletedOnboarding = useUnfoldStore((s) => s.user?.hasCompletedOnboarding ?? false);
  const debugForceTrialExpired = useUIState((s) => s.debugForceTrialExpired);
  const isPremium = debugForceTrialExpired ? false : __DEV__ ? true : isPremiumReal;
  const shouldShowOverlay = !isPremium && hasCompletedOnboarding;

  // Native-presented routes in this stack (wallpaper = modal, day-menu =
  // formSheet) sit outside the sibling overlay's React tree, so a runtime
  // premium flip while one of them is open would leave the sheet interactive
  // on top of a pointerEvents-none'd stack. Targeted dismissal only:
  // we check the current top segment and pop it if and only if it's one of
  // the native-presented routes. Pushed in-stack routes (reading, journal,
  // highlights, etc.) are left mounted so their component state (drafts,
  // editor buffers) survives the premium flip under the overlay.
  const topSegment = segments[segments.length - 1];
  const topIsNativePresented = typeof topSegment === 'string' && NATIVE_PRESENTED_ROUTES.has(topSegment);
  useEffect(() => {
    if (!shouldShowOverlay || !topIsNativePresented) return;
    try {
      if (router.canGoBack()) router.back();
    } catch {
      // back() can throw mid-transition; safe to ignore — the overlay
      // is already covering the underlying React tree.
    }
  }, [shouldShowOverlay, topIsNativePresented, router]);

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
