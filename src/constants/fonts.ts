/**
 * Unfold Font System
 * Typography configuration for the app.
 */

export const FontFamily = {
  // Primary serif (Instrument Serif) kept as the main display/headings font
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',

  // Secondary sans (Inter) for body + UI. Variety comes from weights/italics, not more families.
  body: 'Inter_400Regular',
  bodyItalic: 'Inter_400Italic',
  bodyMedium: 'Inter_500Medium',
  bodyBold: 'Inter_700Bold',

  // Aliases kept for backwards compat — now mapped to Inter
  mono: 'Inter_400Regular',
  monoMedium: 'Inter_500Medium',

  // UI labels - Inter
  ui: 'Inter_400Regular',
  uiMedium: 'Inter_500Medium',
  uiSemiBold: 'Inter_600SemiBold',
} as const;

// Font sizes following the spec
export const FontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
  '6xl': 60,
} as const;

// Line heights
export const LineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.7,
} as const;
