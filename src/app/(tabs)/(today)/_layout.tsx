import { Stack } from 'expo-router';
import { useUnfoldStore } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import { TrialExpiredOverlay } from '@/components/TrialExpiredOverlay';

export default function TodayLayout() {
  // Render-phase paywall gate. Zustand reads are synchronous via
  // useSyncExternalStore, so the first render already sees truth —
  // no one-frame flash of gated content. See
  // ~/vault/standards/navigation-in-render-not-effects.md
  const isPremiumReal = useUnfoldStore((s) => s.user?.isPremium ?? true);
  const hasCompletedOnboarding = useUnfoldStore((s) => s.user?.hasCompletedOnboarding ?? false);
  const debugForceTrialExpired = useUIState((s) => s.debugForceTrialExpired);
  const isPremium = debugForceTrialExpired ? false : __DEV__ ? true : isPremiumReal;

  if (!isPremium && hasCompletedOnboarding) {
    return <TrialExpiredOverlay />;
  }

  return (
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
  );
}
