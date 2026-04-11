import { Stack } from 'expo-router';
import { useUnfoldStore } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import { TrialExpiredOverlay } from '@/components/TrialExpiredOverlay';

export default function AskLayout() {
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
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
