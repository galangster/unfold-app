import { useMemo } from 'react';
import { useUnfoldStore, READING_FONTS, ReadingFontId } from '@/lib/store';
import { FontFamily } from '@/constants/fonts';

/**
 * Returns the active reading font family names.
 * Falls back to the default Source Serif for non-premium or unset users.
 */
export function useReadingFont() {
  const readingFontId = useUnfoldStore((s) => s.user?.readingFont ?? 'source-serif');
  const isPremium = useUnfoldStore((s) => s.user?.isPremium ?? false);

  return useMemo(() => {
    // Non-premium users always get the default font
    const id: ReadingFontId = isPremium ? readingFontId : 'source-serif';
    const font = READING_FONTS.find((f) => f.id === id) ?? READING_FONTS[0];

    return {
      body: font.regular,
      bodyItalic: font.italic,
      bodyMedium: font.medium,
      bodyBold: font.bold,
      // Keep non-body fonts the same
      display: FontFamily.display,
      displayItalic: FontFamily.displayItalic,
      mono: FontFamily.mono,
      monoMedium: FontFamily.monoMedium,
      ui: FontFamily.ui,
      uiMedium: FontFamily.uiMedium,
      uiSemiBold: FontFamily.uiSemiBold,
    };
  }, [readingFontId, isPremium]);
}
