/**
 * Unfold Typography Presets
 * Named text style presets combining fontFamily + fontSize + lineHeight.
 * Named "Typography" to avoid collision with React Native's TextStyle type.
 */

import { FontFamily, FontSize, LineHeight } from './fonts';

export const Typography = {
  // Display — Gupter for headings
  displayLg: {
    fontFamily: FontFamily.display,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  displayMd: {
    fontFamily: FontFamily.display,
    fontSize: 21,
    lineHeight: 25,
    letterSpacing: -0.2,
  },
  displaySm: {
    fontFamily: FontFamily.display,
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.2,
  },

  // Body — Inter for reading content
  bodyLg: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.lg, // 18
    lineHeight: Math.round(FontSize.lg * LineHeight.normal), // 27
  },
  bodyMd: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base, // 16
    lineHeight: Math.round(FontSize.base * LineHeight.normal), // 24
  },
  bodySm: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm, // 14
    lineHeight: Math.round(FontSize.sm * LineHeight.normal), // 21
  },

  // UI — Inter for buttons, labels, controls
  uiLg: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base, // 16
    lineHeight: Math.round(FontSize.base * LineHeight.tight), // 19
  },
  uiMd: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm, // 14
    lineHeight: Math.round(FontSize.sm * LineHeight.tight), // 17
  },
  uiSm: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs, // 12
    lineHeight: Math.round(FontSize.xs * LineHeight.tight), // 14
  },

  // Caption — smallest text
  caption: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    lineHeight: Math.round(11 * LineHeight.normal), // 17
  },

  // Section header — sentence case, replaces label+rule eyebrows above content groups
  sectionHeader: {
    fontFamily: FontFamily.uiSemiBold, // Inter_600SemiBold
    fontSize: FontSize.xl, // 20
    lineHeight: Math.round(FontSize.xl * LineHeight.tight), // 24
    letterSpacing: 0,
  },
  // Card metadata — category/type info demoted BELOW card titles, Calm-style
  cardMeta: {
    fontFamily: FontFamily.ui, // Inter_400Regular
    fontSize: FontSize.xs, // 12
    lineHeight: Math.round(FontSize.xs * LineHeight.normal), // 18
    letterSpacing: 0,
  },

  // Onboarding question headline — the single scale for every step question.
  // (Audit 2026-08-05: three ad hoc scales — 32/42, 32/40, 28/36 — drifted
  // against each other across ~30 steps.)
  onboardingHeadline: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    lineHeight: 37,
    letterSpacing: -0.4,
  },

  // Relaxed reading body for conversational surfaces (companion thread).
  // One vertical rhythm for user AND assistant bubbles.
  bodyRelaxed: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base, // 16
    lineHeight: 26,
    letterSpacing: 0,
  },

} as const;
