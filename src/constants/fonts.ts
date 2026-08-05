/**
 * Unfold Font System
 * Typography configuration for the app.
 */

export const FontFamily = {
  // Primary serif (PP Editorial New Light) for display/headings. Nick prefers no
  // serif italics, so displayItalic intentionally aliases the regular face.
  display: 'PPEditorialNew-Light',
  displayItalic: 'PPEditorialNew-Light',

  // Secondary sans (Inter) for body + UI. Variety comes from weights/italics, not more families.
  body: 'Inter_400Regular',
  bodyItalic: 'Inter_400Regular_Italic',
  bodyMedium: 'Inter_500Medium',
  bodyBold: 'Inter_700Bold',

  // Legacy aliases kept for backwards compatibility. Do not use these as a
  // generic metadata-label style; prefer ui/uiMedium unless the text is truly
  // technical (timer, progress, error detail). They intentionally resolve to Inter.
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
