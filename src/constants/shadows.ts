/**
 * Unfold Shadow System
 * Standardized elevation tiers for consistent depth.
 */

import { Platform } from 'react-native';

export const Shadow = {
  sm: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 10,
    },
    android: { elevation: 2 },
    default: {},
  }),
  md: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
    },
    android: { elevation: 3 },
    default: {},
  }),
  lg: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
    },
    android: { elevation: 6 },
    default: {},
  }),
  sheet: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
    },
    android: { elevation: 24 },
    default: {},
  }),
} as const;

// ---------------------------------------------------------------------------
// Theme-aware elevation
//
// Black shadow stacks vanish against dark surfaces, so raised elements in
// dark mode carry a single low-alpha warm-white ring instead (drawn as a
// border — RN has no spread-only shadow). Light mode keeps the Shadow tier.
// Use for depth (cards, sheets, toasts); deliberate accent GLOWS (e.g. the
// home hero, paywall CTA) are a different tool and stay hand-tuned.
// ---------------------------------------------------------------------------

const DARK_RING = {
  borderWidth: 1,
  borderColor: 'rgba(245, 240, 235, 0.09)',
} as const;

const DARK_RING_STRONG = {
  borderWidth: 1,
  borderColor: 'rgba(245, 240, 235, 0.14)',
} as const;

/**
 * Depth treatment for a raised surface in the current theme.
 * Spread the result into the element's style.
 */
export function elevated(tier: 'sm' | 'md' | 'lg' | 'sheet', isDark: boolean) {
  if (!isDark) return Shadow[tier];
  return tier === 'lg' || tier === 'sheet' ? DARK_RING_STRONG : DARK_RING;
}
