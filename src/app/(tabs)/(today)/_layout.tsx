import { useEffect, useRef } from 'react';
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
  // Dismissal is a TWO-STAGE observer, not a retry loop:
  //
  //   Stage 1: Fire a single `router.back()` and let iOS run its modal
  //            dismissal animation (formSheet ~300ms, modal ~400ms).
  //   Stage 2: After a wait long enough to cover the slowest native
  //            animation, do a SINGLE fresh navigation-state read. If
  //            the top segment is no longer a gated native route, we
  //            succeeded — done. Only if it's STILL on a gated native
  //            route do we escalate to `dismissAll()`.
  //
  // Why not a retry loop with short ticks? Each retry tick that fires
  // while the first dismissal is still animating risks popping the
  // screen BENEATH the sheet (draft state loss) OR prematurely
  // escalating into `dismissAll()` (nukes the entire tab stack). iOS
  // native dismiss animations commonly outlive a 240ms window, so
  // short-tick loops are structurally unsafe. A single long wait that
  // exceeds the animation ceiling gives the targeted back() time to
  // resolve on its own; if after that wait we're still on the sheet,
  // something is actually wrong and a full stack reset is warranted.
  //
  // `segmentsRef` gives us a closure-free read of current segments so
  // the stage-2 timer sees the latest navigation state even though the
  // effect was scheduled on an earlier render.
  const topSegment = segments[segments.length - 1];
  const topIsNativePresented = typeof topSegment === 'string' && NATIVE_PRESENTED_ROUTES.has(topSegment);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  useEffect(() => {
    if (!shouldShowOverlay || !topIsNativePresented) return;

    let cancelled = false;
    // Must exceed the slowest native dismissal. iOS formSheet is
    // ~300ms, full-screen modal is ~400ms. 700ms gives comfortable
    // headroom without being so long the overlay feels interactive
    // in the gap (the stack is already pointerEvents-none'd via
    // `shouldShowOverlay`, so the only thing still live is the native
    // sheet itself, which the user cannot usefully interact with
    // because it's gating a non-premium experience).
    const STAGE_2_DELAY_MS = 700;

    const currentTopIsNative = (): boolean => {
      const segs = segmentsRef.current;
      const top = segs[segs.length - 1];
      return typeof top === 'string' && NATIVE_PRESENTED_ROUTES.has(top);
    };

    // Stage 1: fire one targeted back(). Swallow throws — if back()
    // throws mid-transition, stage 2 will catch the leftover state.
    try {
      if (router.canGoBack()) {
        router.back();
      }
    } catch {
      // fall through to stage 2
    }

    // Stage 2: single fresh verification after the animation window.
    const timer = setTimeout(() => {
      if (cancelled) return;
      // Success path: segments have moved off the gated native route —
      // targeted dismissal worked, leave the rest of the stack alone.
      if (!currentTopIsNative()) return;
      // Still on the sheet after the full animation window. Escalate.
      try {
        router.dismissAll();
      } catch {
        router.replace('/(tabs)/(today)');
      }
    }, STAGE_2_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
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
