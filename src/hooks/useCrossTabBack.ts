import { useCallback, useEffect, useLayoutEffect } from 'react';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

/**
 * Handles back navigation for screens opened via cross-tab push (e.g. home → (you)/my-content).
 *
 * Problem: Expo Router push to another tab's stack means the native swipe-back gesture
 * pops within that tab's stack (revealing the wrong screen) instead of returning to the
 * source tab. The chevron back button handles this with `from === 'home'` param routing.
 *
 * Solution: When `from === 'home'`, disable the native swipe gesture AND intercept
 * the beforeRemove event to redirect back to the home tab.
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

  // Intercept any back navigation (swipe, hardware button, etc.) and redirect to home tab
  useEffect(() => {
    if (from !== 'home') return;

    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      // Prevent the default back behavior
      e.preventDefault();
      // Navigate to the home tab instead
      router.navigate('/(tabs)/(today)');
    });

    return unsubscribe;
  }, [from, navigation, router]);

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
