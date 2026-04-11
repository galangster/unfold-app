import { useCallback, useEffect, useLayoutEffect } from 'react';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

/**
 * Handles back navigation for screens opened via cross-tab push.
 * Maps `from` param to the correct tab route so back always returns
 * to the source tab, not the (you) tab's index.
 */
const FROM_TO_ROUTE: Record<string, string> = {
  home: '/(tabs)/(today)',
  journal: '/(tabs)/(journal)',
  bible: '/(tabs)/(bible)',
};

export function useCrossTabBack() {
  const router = useRouter();
  const navigation = useNavigation();
  const { from } = useLocalSearchParams<{ from?: string }>();

  const isCrossTab = !!from && from in FROM_TO_ROUTE;
  const returnRoute = from ? FROM_TO_ROUTE[from] : undefined;

  // Disable native swipe gesture for cross-tab navigations
  useLayoutEffect(() => {
    if (isCrossTab) {
      navigation.setOptions({ gestureEnabled: false });
    }
  }, [isCrossTab, navigation]);

  // Intercept any back navigation and redirect to source tab
  useEffect(() => {
    if (!isCrossTab || !returnRoute) return;

    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      router.navigate(returnRoute as any);
    });

    return unsubscribe;
  }, [isCrossTab, returnRoute, navigation, router]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isCrossTab && returnRoute) {
      router.navigate(returnRoute as any);
    } else {
      router.back();
    }
  }, [isCrossTab, returnRoute, router]);

  return { handleBack, isFromHome: from === 'home' };
}
