/**
 * Unfold Font System
 * Typography configuration for the app.
 */
import { Platform } from 'react-native';

// The expo-font config plugin registers PostScript names on iOS. Expo Go does
// not contain those embedded resources, so it keeps the runtime aliases loaded
// by app/_layout.tsx. Android config explicitly registers the existing aliases.
function hasEmbeddedStartupFonts(): boolean {
  if (Platform.OS === 'web' || process.env.NODE_ENV === 'test') return false;
  try {
    // Keep expo-font out of ordinary Jest imports of this ubiquitous constants
    // module. The native registry remains the source of truth at runtime.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Font = require('expo-font') as typeof import('expo-font');
    const loaded = new Set(Font.getLoadedFonts());
    const required = Platform.OS === 'ios'
      ? [
          'PPEditorialNew-Light',
          'Inter-Regular',
          'Inter-Italic',
          'Inter-Medium',
          'Inter-SemiBold',
          'Inter-Bold',
          'SourceSerifPro-Regular',
          'SourceSerifPro-It',
          'SourceSerifPro-SemiBold',
          'SourceSerifPro-Bold',
        ]
      : [
          'PPEditorialNew-Light',
          'Inter_400Regular',
          'Inter_400Regular_Italic',
          'Inter_500Medium',
          'Inter_600SemiBold',
          'Inter_700Bold',
          'SourceSerifPro_400Regular',
          'SourceSerifPro_400Regular_Italic',
          'SourceSerifPro_600SemiBold',
          'SourceSerifPro_700Bold',
        ];
    return required.every((name) => loaded.has(name));
  } catch {
    return false;
  }
}

const embeddedStartupFontsAvailable = hasEmbeddedStartupFonts();
const usesEmbeddedIosFonts = Platform.OS === 'ios' && embeddedStartupFontsAvailable;
const bundledFontName = (runtimeAlias: string, iosPostScriptName: string) =>
  usesEmbeddedIosFonts ? iosPostScriptName : runtimeAlias;

export const shouldLoadBundledFontsAtRuntime = !embeddedStartupFontsAvailable;

export const InterFontFamily = {
  regular: bundledFontName('Inter_400Regular', 'Inter-Regular'),
  italic: bundledFontName('Inter_400Regular_Italic', 'Inter-Italic'),
  medium: bundledFontName('Inter_500Medium', 'Inter-Medium'),
  semiBold: bundledFontName('Inter_600SemiBold', 'Inter-SemiBold'),
  bold: bundledFontName('Inter_700Bold', 'Inter-Bold'),
} as const;

export const SourceSerifFontFamily = {
  regular: bundledFontName('SourceSerifPro_400Regular', 'SourceSerifPro-Regular'),
  italic: bundledFontName('SourceSerifPro_400Regular_Italic', 'SourceSerifPro-It'),
  medium: bundledFontName('SourceSerifPro_600SemiBold', 'SourceSerifPro-SemiBold'),
  bold: bundledFontName('SourceSerifPro_700Bold', 'SourceSerifPro-Bold'),
} as const;

export const FontFamily = {
  // Primary serif (PP Editorial New Light) for display/headings. Nick prefers no
  // serif italics, so displayItalic intentionally aliases the regular face.
  display: 'PPEditorialNew-Light',
  displayItalic: 'PPEditorialNew-Light',

  // Secondary sans (Inter) for body + UI. App-owned presentation stays upright;
  // user journal marks and CSS still use true italic independently.
  body: InterFontFamily.regular,
  bodyItalic: InterFontFamily.regular,
  bodyMedium: InterFontFamily.medium,
  bodyBold: InterFontFamily.bold,

  // Legacy aliases kept for backwards compatibility. Do not use these as a
  // generic metadata-label style; prefer ui/uiMedium unless the text is truly
  // technical (timer, progress, error detail). They intentionally resolve to Inter.
  mono: InterFontFamily.regular,
  monoMedium: InterFontFamily.medium,

  // UI labels - Inter
  ui: InterFontFamily.regular,
  uiMedium: InterFontFamily.medium,
  uiSemiBold: InterFontFamily.semiBold,
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
