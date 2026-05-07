import { useCallback, useEffect, useLayoutEffect } from 'react';
import { useRouter, useNavigation, useLocalSearchParams, useSegments } from 'expo-router';
import * as Haptics from 'expo-haptics';

/**
 * Handles back navigation for screens opened via cross-tab push.
 * Maps `from` param to the correct tab route so back always returns
 * to the source tab, not the (you) tab's index.
 */
export const FROM_TO_ROUTE: Record<string, string> = {
  home: '/(tabs)/(today)',
  journal: '/(tabs)/(journal)',
  bible: '/(tabs)/(bible)',
};

export const FROM_TO_TAB: Record<string, string> = {
  home: '(today)',
  journal: '(journal)',
  bible: '(bible)',
};

export function getCurrentTabFromSegments(segments: readonly string[]): string | undefined {
  const knownTabs = new Set([...Object.values(FROM_TO_TAB), '(you)']);
  return segments.find((segment) => knownTabs.has(segment));
}

export function isCrossTabBackNavigation(from: string | undefined, segments: readonly string[]) {
  if (!from || !(from in FROM_TO_ROUTE)) return false;
  const sourceTab = FROM_TO_TAB[from];
  const currentTab = getCurrentTabFromSegments(segments);

  // Today-stack alias screens may still carry from=home to suppress entry
  // motion or choose Today detail routes. They are same-tab navigations, not
  // cross-tab pushes, so native pop/swipe-back must stay natural.
  return currentTab !== sourceTab;
}

/** Keep native swipe gestures enabled; beforeRemove still redirects cross-tab backs. */
export function getCrossTabGestureOptions(isCrossTab: boolean) {
  return isCrossTab ? { gestureEnabled: true } : undefined;
}

export function useCrossTabBack() {
  const router = useRouter();
  const navigation = useNavigation();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const segments = useSegments();

  const isCrossTab = isCrossTabBackNavigation(from, segments);
  const returnRoute = from ? FROM_TO_ROUTE[from] : undefined;

  // Keep native swipe gestures enabled for cross-tab screens. The beforeRemove
  // listener below still redirects the pop back to the source tab.
  useLayoutEffect(() => {
    const options = getCrossTabGestureOptions(isCrossTab);
    if (options) {
      navigation.setOptions(options);
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
