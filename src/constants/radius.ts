/**
 * Unfold Border Radius System
 * Standardized radius tiers for consistent rounding.
 */

export const Radius = {
  none: 0,
  sm: 8,
  md: 12,
  card: 14,
  lg: 16,
  xl: 20,
  '2xl': 24,
  /** Small interactive chips/icon wells — formalizes the de facto 10 used across settings rows. */
  chip: 10,
  full: 999,
} as const;
