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
    fontSize: FontSize['4xl'], // 36
    lineHeight: Math.round(FontSize['4xl'] * LineHeight.tight), // 43
  },
  displayMd: {
    fontFamily: FontFamily.display,
    fontSize: FontSize['2xl'], // 24
    lineHeight: Math.round(FontSize['2xl'] * LineHeight.tight), // 29
  },
  displaySm: {
    fontFamily: FontFamily.display,
    fontSize: FontSize.xl, // 20
    lineHeight: Math.round(FontSize.xl * LineHeight.tight), // 24
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

} as const;
