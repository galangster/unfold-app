/**
 * On-demand loader for the non-default reading families (PERF: cold-start font split).
 *
 * `app/_layout.tsx` eagerly loads UI/display faces + the default reading family
 * only. Everything else lands here and is pulled in with `Font.loadAsync` when
 * it is actually needed:
 *   - on hydration / whenever the user's `readingFont` preference changes
 *     (root layout effect — covers every switch site, including the reader's
 *     ReadingSettingsSheet),
 *   - when the Settings font picker is opened, so the previews render in their
 *     real faces rather than the fallback.
 *
 * Safety: a `fontFamily` that is not loaded does not crash on either platform —
 * iOS/Android fall back to the system face. To avoid the "fallback face sticks
 * forever" trap (a resolved `loadAsync` re-renders nothing on its own),
 * `useReadingFont()` reads `reading-font-availability` and keeps serving the
 * default family until the requested one is registered, then re-renders.
 *
 * This file is the only place that `require()`s the lazy .ttf assets — keep it
 * out of anything Jest imports (Jest has no asset transformer configured).
 */
import * as Font from 'expo-font';

import { READING_FONTS, type ReadingFontId } from '@/lib/store';
import { logger } from '@/lib/logger';
import {
  LAZY_READING_FONT_IDS,
  markReadingFontLoaded,
  isReadingFontLoaded,
  type LazyReadingFontId,
} from '@/lib/reading-font-availability';

/**
 * Asset modules per lazy family, in READING_FONTS face order:
 * [regular, italic, medium, bold]. Family *names* are read off READING_FONTS at
 * load time so the registered names can never drift from what the app asks for.
 */
const LAZY_FONT_ASSETS: Record<LazyReadingFontId, [number, number, number, number]> = {
  garamond: [
    require('../../assets/fonts/EBGaramond_400Regular.ttf'),
    require('../../assets/fonts/EBGaramond_400Regular_Italic.ttf'),
    require('../../assets/fonts/EBGaramond_600SemiBold.ttf'),
    require('../../assets/fonts/EBGaramond_700Bold.ttf'),
  ],
  lora: [
    require('../../assets/fonts/Lora_400Regular.ttf'),
    require('../../assets/fonts/Lora_400Regular_Italic.ttf'),
    require('../../assets/fonts/Lora_600SemiBold.ttf'),
    require('../../assets/fonts/Lora_700Bold.ttf'),
  ],
  crimson: [
    require('../../assets/fonts/CrimsonText_400Regular.ttf'),
    require('../../assets/fonts/CrimsonText_400Regular_Italic.ttf'),
    require('../../assets/fonts/CrimsonText_600SemiBold.ttf'),
    require('../../assets/fonts/CrimsonText_700Bold.ttf'),
  ],
  merriweather: [
    require('../../assets/fonts/Merriweather_400Regular.ttf'),
    require('../../assets/fonts/Merriweather_400Regular_Italic.ttf'),
    require('../../assets/fonts/Merriweather_700Bold.ttf'),
    require('../../assets/fonts/Merriweather_900Black.ttf'),
  ],
};

const isLazyFont = (id: ReadingFontId): id is LazyReadingFontId =>
  (LAZY_READING_FONT_IDS as readonly string[]).includes(id);

/** De-dupes concurrent requests for the same family (picker open + switch). */
const inFlight = new Map<LazyReadingFontId, Promise<void>>();

/**
 * Ensure a reading family is loaded. No-ops for eager families, for an
 * already-loaded family, and (silently) for an unknown id.
 */
export async function loadReadingFont(id: ReadingFontId | undefined | null): Promise<void> {
  if (!id || !isLazyFont(id) || isReadingFontLoaded(id)) return;

  const existing = inFlight.get(id);
  if (existing) return existing;

  const font = READING_FONTS.find((f) => f.id === id);
  const assets = LAZY_FONT_ASSETS[id];
  if (!font) return;

  const task = Font.loadAsync({
    [font.regular]: assets[0],
    [font.italic]: assets[1],
    [font.medium]: assets[2],
    [font.bold]: assets[3],
  })
    .then(() => {
      markReadingFontLoaded(id);
    })
    .catch((error: unknown) => {
      // Non-fatal: text keeps rendering in the default reading family.
      logger.warn(`[fonts] failed to load reading family "${id}"`, error);
    })
    .finally(() => {
      inFlight.delete(id);
    });

  inFlight.set(id, task);
  return task;
}

/**
 * Load every lazy family. Called when the Settings font picker mounts/expands
 * so each row can preview in its own face.
 */
export async function loadAllReadingFonts(): Promise<void> {
  await Promise.all(LAZY_READING_FONT_IDS.map((id) => loadReadingFont(id)));
}
