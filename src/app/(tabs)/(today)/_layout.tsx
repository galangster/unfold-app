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
  // Dismissal must not silently fail. `router.back()` can throw or no-op
  // mid-transition, and a single best-effort attempt would let the native
  // sheet stay interactive above the paywall overlay — a direct gating
  // bypass. But retries also must NOT fire blindly: a second back() while
  // the first is still animating will pop the screen BENEATH the native
  // sheet, destroying reading/journal draft state beneath. So every
  // retry tick must re-read navigation state before acting: we keep a
  // `segmentsRef` updated on every render (fresh closure-free read),
  // and the retry closure checks it before each `router.back()` call.
  // If the top segment has already left `NATIVE_PRESENTED_ROUTES`, we
  // bail out — the native sheet is gone, reading/journal is intact, no
  // more pops needed. Only if the top segment is still a gated native
  // presentation after the attempt cap do we escalate to `dismissAll()`,
  // and only after re-verifying it's STILL a gated native presentation
  // at escalation time.
  const topSegment = segments[segments.length - 1];
  const topIsNativePresented = typeof topSegment === 'string' && NATIVE_PRESENTED_ROUTES.has(topSegment);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  useEffect(() => {
    if (!shouldShowOverlay || !topIsNativePresented) return;

    let cancelled = false;
    let attempts = 0;
    const MAX_BACK_ATTEMPTS = 3;
    const BACK_RETRY_DELAY_MS = 80;

    const currentTopIsNative = (): boolean => {
      const segs = segmentsRef.current;
      const top = segs[segs.length - 1];
      return typeof top === 'string' && NATIVE_PRESENTED_ROUTES.has(top);
    };

    const escalate = () => {
      // Only nuke the stack if we're STILL on a gated native
      // presentation. If segments already moved away while we were
      // waiting, the transition resolved on its own and we must not
      // over-pop into non-gated screens below.
      if (!currentTopIsNative()) return;
      try {
        router.dismissAll();
      } catch {
        router.replace('/(tabs)/(today)');
      }
    };

    const tryDismiss = () => {
      if (cancelled) return;

      // Fresh navigation-state read. If the native sheet is already
      // gone, bail — no further pops. This is the guard that prevents
      // over-popping a successful first back() into the reading/journal
      // screen beneath.
      if (!currentTopIsNative()) return;

      attempts += 1;
      if (attempts > MAX_BACK_ATTEMPTS) {
        escalate();
        return;
      }

      try {
        if (router.canGoBack()) {
          router.back();
        } else {
          // canGoBack said false but we're still on a native sheet —
          // weird stack state; nuke to tab root.
          escalate();
          return;
        }
      } catch {
        // back() threw mid-transition. Fall through to the scheduled
        // retry.
      }

      setTimeout(tryDismiss, BACK_RETRY_DELAY_MS);
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
