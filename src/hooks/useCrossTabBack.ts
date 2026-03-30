import { useCallback, useLayoutEffect } from 'react';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

/**
 * Handles back navigation for screens opened via cross-tab push (e.g. home → (you)/my-content).
 *
 * Problem: Expo Router push to another tab's stack means the native swipe-back gesture
 * pops within that tab's stack (revealing the wrong screen) instead of returning to the
 * source tab. The chevron back button handles this with `from === 'home'` param routing.
 *
 * Solution: When `from === 'home'`, disable the native swipe gesture so the user must
 * use the chevron (which correctly navigates back to the home tab).
 */
export function useCrossTabBack() {
  const router = useRouter();
  const navigation = useNavigation();
  const { from } = useLocalSearchParams<{ from?: string }>();

  // Disable native swipe gesture for cross-tab navigations
  useLayoutEffect(() => {
    if (from === 'home') {
      navigation.setOptions({ gestureEnabled: false });
    }
  }, [from, navigation]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (from === 'home') {
      router.navigate('/(tabs)/(today)');
    } else {
      router.back();
    }
  }, [from, router]);

  return { handleBack, isFromHome: from === 'home' };
}
