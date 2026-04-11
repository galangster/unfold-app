import { useEffect } from 'react';
import { View, StyleSheet, Modal } from 'react-native';
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
  //
  // Dismissal must not silently fail. `router.back()` can throw mid-
  // transition, and a single best-effort attempt lets the native sheet
  // stay interactive above the paywall overlay — a direct gating bypass.
  // We retry with exponential backoff and, if the top segment still
  // hasn't left the native-presented set after N attempts, fall back to
  // `router.dismissAll()` to nuke the whole stack back to `index`. That
  // trades losing in-stack drafts (reading buffer, etc.) for the harder
  // guarantee that no gated native sheet remains interactive above the
  // overlay. The trade is the right one: a churn event is rare, but if
  // it happens we MUST cover the surface.
  const topSegment = segments[segments.length - 1];
  const topIsNativePresented = typeof topSegment === 'string' && NATIVE_PRESENTED_ROUTES.has(topSegment);
  useEffect(() => {
    if (!shouldShowOverlay || !topIsNativePresented) return;

    let cancelled = false;
    let attempts = 0;
    const MAX_BACK_ATTEMPTS = 3;
    const BACK_RETRY_DELAY_MS = 80;

    const tryDismiss = () => {
      if (cancelled) return;
      attempts += 1;
      try {
        if (router.canGoBack()) {
          router.back();
          // Schedule a verification pass; if we're still on a native-
          // presented segment after this tick, back() no-op'd and we
          // need to retry or escalate.
          setTimeout(() => {
            if (cancelled) return;
            // Re-read segments via the route object indirectly — we
            // schedule another attempt and let the effect's next run
            // decide whether we're still stuck. Since segments is a
            // captured closure here, we just retry unconditionally up
            // to the attempt cap.
            if (attempts < MAX_BACK_ATTEMPTS) {
              tryDismiss();
            } else {
              try {
                router.dismissAll();
              } catch {
                router.replace('/(tabs)/(today)');
              }
            }
          }, BACK_RETRY_DELAY_MS);
          return;
        }
        // canGoBack said false — the stack has nothing to pop, which
        // shouldn't happen when a native sheet is on top, but if it
        // does, nuke to the tab root.
        try {
          router.dismissAll();
        } catch {
          router.replace('/(tabs)/(today)');
        }
      } catch {
        // back() threw mid-transition. Retry up to the cap, then
        // escalate to dismissAll + hard replace.
        if (attempts < MAX_BACK_ATTEMPTS) {
          setTimeout(tryDismiss, BACK_RETRY_DELAY_MS);
        } else {
          try {
            router.dismissAll();
          } catch {
            router.replace('/(tabs)/(today)');
          }
        }
      }
    };

    tryDismiss();

    return () => {
      cancelled = true;
    };
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
      {/*
        Paywall presented via RN Modal so it renders in the top-level modal
        layer. Without this, in-stack RN <Modal> sheets (CheckInSheet, the
        folder sheets, etc.) render ABOVE a sibling-View overlay regardless
        of pointerEvents, and a churn event while one is open leaves the
        sheet interactive on top of the paywall.
      */}
      <Modal
        visible={shouldShowOverlay}
        transparent
        animationType="fade"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => {}}
      >
        <View
          style={StyleSheet.absoluteFill}
          accessibilityViewIsModal
          importantForAccessibility="yes"
        >
          <TrialExpiredOverlay />
        </View>
      </Modal>
    </View>
  );
}
