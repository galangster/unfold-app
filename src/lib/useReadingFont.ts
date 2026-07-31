import { useMemo } from 'react';
import { useUnfoldStore, READING_FONTS, ReadingFontId } from '@/lib/store';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { FontFamily } from '@/constants/fonts';
import {
  DEFAULT_READING_FONT_ID,
  isReadingFontLoaded,
  useReadingFontAvailability,
} from '@/lib/reading-font-availability';

/**
 * Returns the active reading font family names.
 * Falls back to the default Source Serif for non-premium or unset users.
 *
 * PERF (cold start): non-default families are lazy-loaded, so this also falls
 * back to Source Serif while the selected family is still in flight, and
 * re-renders (via the availability subscription) the moment it lands. Without
 * that, text would paint once in the platform fallback face and stay there —
 * `Font.loadAsync` resolving does not invalidate anything by itself.
 */
export function useReadingFont() {
  const readingFontId = useUnfoldStore((s) => s.user?.readingFont ?? DEFAULT_READING_FONT_ID);
  const premiumPolicy = usePremiumAccessPolicy();
  const isPremium = premiumPolicy === 'granted';
  const fontsAvailableVersion = useReadingFontAvailability();

  return useMemo(() => {
    // Non-premium users always get the default font
    const selected: ReadingFontId = isPremium ? readingFontId : DEFAULT_READING_FONT_ID;
    // Not loaded yet → keep the default family rather than handing RN a name
    // it will silently swap for the system face.
    const id: ReadingFontId = isReadingFontLoaded(selected) ? selected : DEFAULT_READING_FONT_ID;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- availability version is a re-resolve trigger, not a value
  }, [readingFontId, isPremium, fontsAvailableVersion]);
}
