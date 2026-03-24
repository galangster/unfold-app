/**
 * Unfold Animation System
 * Shared timing, easing, and spring constants.
 * All product UI durations under 350ms per design rules.
 * All springs critically-damped (no bounce).
 */

import { Easing } from 'react-native-reanimated';

// Durations (ms)
export const Duration = {
  instant: 100,
  fast: 150,
  normal: 250,
  slow: 340,
} as const;

// Easing presets
export const Ease = {
  out: Easing.out(Easing.cubic),
  in: Easing.in(Easing.cubic),
  inOut: Easing.inOut(Easing.cubic),
} as const;

// Spring configs — critically-damped only (no bounce)
export const Spring = {
  press: { damping: 35, stiffness: 300, mass: 0.8 },
  gentle: { damping: 20, stiffness: 100, mass: 1 },
  snappy: { damping: 22, stiffness: 200, mass: 0.6 },
} as const;

// Stagger delay between list items (ms)
export const Stagger = {
  fast: 40,
  normal: 80,
  slow: 120,
} as const;
