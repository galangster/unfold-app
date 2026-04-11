import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useUnfoldStore, useHasHydrated } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';
import { useTheme } from '@/lib/theme';
import { TrialExpiredOverlay } from '@/components/TrialExpiredOverlay';

export default function AskLayout() {
  // See (today)/_layout.tsx for the full rationale — same pattern:
  // hydration gate, then sibling-rendered overlay so in-progress screen
  // state (Companion thread, drafts) survives a runtime premium flip.
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
          }}
        >
          <Stack.Screen name="index" />
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
