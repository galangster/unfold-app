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

// Duration-based spring configs — critically-damped only (no bounce)
export const SpringConfig = {
  /** Button press, micro-interactions */
  quick: { duration: 150, dampingRatio: 1 },
  /** Card transitions, standard UI */
  standard: { duration: 280, dampingRatio: 1 },
  /** Sheets, modals, large elements */
  smooth: { duration: 340, dampingRatio: 1 },
} as const;

// Ambient art timing constants
export const AmbientTiming = {
  /** Shader breathing cycle (ms) */
  breathCycle: 5000,
  /** Full ring rotation (ms) */
  ringRotation: 60000,
  /** Particle float duration range */
  particleMin: 7000,
  particleMax: 12000,
  /** Time loop total (ms) — 10 minutes */
  timeLoop: 600000,
} as const;
