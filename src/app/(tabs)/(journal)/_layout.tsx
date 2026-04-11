import { Stack } from 'expo-router';
import { useUnfoldStore } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import { TrialExpiredOverlay } from '@/components/TrialExpiredOverlay';

export default function JournalLayout() {
  // Render-phase paywall gate. See
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
      <Stack.Screen name="entry" options={{ animation: 'ios_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
      <Stack.Screen name="note" options={{ animation: 'ios_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
      <Stack.Screen name="note-detail" options={{ animation: 'ios_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
      <Stack.Screen name="my-responses" options={{ animation: 'ios_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
    </Stack>
  );
}
