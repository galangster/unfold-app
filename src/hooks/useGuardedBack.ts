import { useCallback } from 'react';
import { useNavigation, useRouter, useSegments } from 'expo-router';

import { goBackOr, tabRootFromSegments } from '@/lib/navigation';

/**
 * The back handler every screen should use.
 *
 * `router.back()` is a silent no-op on an empty stack, and `canGoBack()` on
 * its own cannot tell an empty leaf stack from one sitting on the root anchor
 * — see goBackOr in src/lib/navigation.ts for both failure shapes. This hook
 * reads the three inputs that decision needs (the router, the current
 * segments, and this screen's index in its own stack) so no screen has to.
 *
 * The fallback is derived rather than passed: it is the root of whichever tab
 * the reader is currently in, which is also what a screen mounted in two tabs
 * needs — `(today)/journal` and `(journal)/entry` are one component, as are
 * the `(today)` and `(you)` copies of series-detail, my-content and
 * past-devotionals. Routes outside the tabs resolve to Today, the app's home.
 *
 * Haptics stay at the call site: the caret that fires one and the auto-exit
 * that must not are both real cases.
 */
export function useGuardedBack(): () => void {
  const router = useRouter();
  const segments = useSegments();
  const navigation = useNavigation();

  return useCallback(() => {
    goBackOr(router, tabRootFromSegments(segments), navigation.getState()?.index ?? 0);
  }, [router, segments, navigation]);
}
