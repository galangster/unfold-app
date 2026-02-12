/**
 * Unfold Font System
 * Typography configuration for the app.
 */

export const FontFamily = {
  // Display/Headers - elegant serif
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',

  // Body text - warm, readable serif
  body: 'SourceSerifPro_400Regular',
  bodyItalic: 'SourceSerifPro_400Regular_Italic',
  bodyMedium: 'SourceSerifPro_600SemiBold',
  bodyBold: 'SourceSerifPro_700Bold',

  // User input - monospace
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',

  // UI labels - minimal use
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
