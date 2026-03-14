import { useReducedMotion } from 'react-native-reanimated';

/**
 * Accessibility hook for respecting reduced motion preferences.
 * Wraps reanimated's useReducedMotion and provides helpers
 * to conditionally apply entering/exiting animations.
 */
export function useAccessibleAnimation() {
  const reducedMotion = useReducedMotion();

  return {
    reducedMotion,
    /** Returns the animation config or undefined if reduced motion is on */
    entering: (anim: any) => (reducedMotion ? undefined : anim),
    /** Returns the animation config or undefined if reduced motion is on */
    exiting: (anim: any) => (reducedMotion ? undefined : anim),
  };
}
