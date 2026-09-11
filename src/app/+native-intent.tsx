/**
 * expo-router native intent hook (P3-4 item 2).
 *
 * expo-router calls `redirectSystemPath` for every externally arriving URL on
 * native — the cold-start initial URL (`initial: true`) and warm `Linking`
 * events (`initial: false`) — before it resolves a route. Anything that is
 * not on the explicit allowlist in src/lib/deep-link-allowlist.ts, or whose
 * params fail their schema, is rewritten to the root anchor; accepted URLs
 * pass through untouched.
 *
 * This hook is NATIVE ONLY: expo-router never consults it on web, where the
 * per-route guards (src/app/reveal.tsx, src/app/(tabs)/(bible)/reader.tsx)
 * are the only protection.
 */
import { DEEP_LINK_FALLBACK_PATH, resolveExternalDeepLink } from '@/lib/deep-link-allowlist';
import { logger } from '@/lib/logger';
import { isQaToolsEnabled } from '@/lib/qa-tools';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  try {
    if (__DEV__ && isQaToolsEnabled() && path.startsWith('unfold://dev/voice-check-in')) {
      const preview = new URL(path);
      const fixtureUrl = preview.searchParams.get('fixtureUrl');
      let validFixtureUrl = true;
      if (fixtureUrl) {
        const fixture = new URL(fixtureUrl);
        validFixtureUrl = fixture.protocol === 'http:'
          && (fixture.hostname === '127.0.0.1' || fixture.hostname === 'localhost');
      }
      const keys = [...preview.searchParams.keys()];
      const validPreview = preview.hostname === 'dev' && preview.pathname === '/voice-check-in'
        && new Set(keys).size === keys.length
        && validFixtureUrl
        && (!fixtureUrl || preview.searchParams.get('transport') === 'real')
        && [...preview.searchParams].every(([key, value]) => {
          if (key === 'state') return ['idle', 'recording', 'review', 'saved', 'error'].includes(value);
          if (key === 'theme') return ['dark', 'light'].includes(value);
          if (key === 'transport') return value === 'real';
          return key === 'fixtureUrl';
        });
      if (validPreview) return path;
    }
    if (__DEV__ && isQaToolsEnabled() && path.startsWith('unfold://dev/onboarding-voice-answer')) {
      const preview = new URL(path);
      const keys = [...preview.searchParams.keys()];
      const validPreview = preview.hostname === 'dev' && preview.pathname === '/onboarding-voice-answer'
        && new Set(keys).size === keys.length
        && [...preview.searchParams].every(([key, value]) => {
          if (key === 'state') return ['idle', 'recording', 'review', 'transcribing', 'transcript', 'error'].includes(value);
          return key === 'existing' && ['typed', 'overLimit'].includes(value);
        });
      if (validPreview) return path;
    }
    if (__DEV__ && isQaToolsEnabled() && path.startsWith('unfold://dev/trial-series')) {
      const preview = new URL(path);
      const keys = [...preview.searchParams.keys()];
      const validPreview = preview.hostname === 'dev' && preview.pathname === '/trial-series'
        && preview.searchParams.has('state')
        && new Set(keys).size === keys.length
        && [...preview.searchParams].every(([key, value]) => {
          if (key === 'state') {
            return [
              'reveal-generating',
              'reveal-failed',
              'reveal-exhausted',
              'confirmation',
              'later-entry-notify',
              'today-day1',
              'today-day2',
              'today-day2-read',
              'today-day3',
              'today-lapsed-before-day3',
              'series-complete',
            ].includes(value);
          }
          if (key === 'theme') return value === 'dark' || value === 'light';
          return false;
        });
      if (validPreview) return path;
    }
    const decision = resolveExternalDeepLink(path);
    if (decision.allowed) return path;

    // Log route + reason only — never the raw URL, whose params may carry text.
    const detail = [
      decision.reason,
      decision.route ? `route=${decision.route}` : null,
      decision.param ? `param=${decision.param}` : null,
      `initial=${initial}`,
    ]
      .filter(Boolean)
      .join(' ');
    logger.warn(`[DeepLink] Rejected external URL (${detail}) → ${DEEP_LINK_FALLBACK_PATH}`);
    return DEEP_LINK_FALLBACK_PATH;
  } catch (error) {
    logger.warn('[DeepLink] Failed to validate external URL; redirecting to the root anchor', error);
    return DEEP_LINK_FALLBACK_PATH;
  }
}
