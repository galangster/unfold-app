import type { AccentThemeId } from '@/lib/store';
import type { PremiumAccessPolicy } from '@/lib/premium-access-policy';

export const DEFAULT_ACCENT_THEME_ID: AccentThemeId = 'gold';

/**
 * Accent themes are a premium feature. The reading font is force-reverted at
 * render time for a lapsed subscriber (useReadingFont); the accent must be
 * too, or a churned user keeps a premium accent forever. 'unknown' (store not
 * hydrated or RevenueCat not reported in yet) keeps the persisted accent so a
 * paying user never sees a gold flash at cold start.
 *
 * Pure and free of native imports so it can be tested without the store.
 */
export function resolveEffectiveAccentThemeId(
  persisted: AccentThemeId | undefined,
  policy: PremiumAccessPolicy,
): AccentThemeId {
  if (policy === 'denied') return DEFAULT_ACCENT_THEME_ID;
  return persisted ?? DEFAULT_ACCENT_THEME_ID;
}
