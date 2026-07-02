import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * Accessibility hook for respecting reduced motion preferences.
 * Reanimated's useReducedMotion samples the setting once at mount and never
 * updates, so a user toggling Reduce Motion mid-session kept seeing ambient
 * animation until the next cold launch (FEEL-06). We seed with reanimated's
 * mount-time value (correct first render), then track live changes via
 * AccessibilityInfo's reduceMotionChanged event.
 */
export function useAccessibleAnimation() {
  const initialReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReducedMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReducedMotion(enabled);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return {
    reducedMotion,
    /** Returns the animation config or undefined if reduced motion is on */
    entering: (anim: any) => (reducedMotion ? undefined : anim),
    /** Returns the animation config or undefined if reduced motion is on */
    exiting: (anim: any) => (reducedMotion ? undefined : anim),
  };
}
