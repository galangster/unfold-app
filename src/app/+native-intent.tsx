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
import { isTrialSeriesFixtureState } from '@/lib/trial-series-fixtures';

const DEV_PREVIEW_ROUTES: {
  pathname: string;
  params: Record<string, (value: string) => boolean>;
  required?: readonly string[];
}[] = [
  {
    pathname: '/voice-check-in',
    params: {
      state: (value) => ['idle', 'recording', 'review', 'saved', 'error'].includes(value),
      theme: (value) => ['dark', 'light'].includes(value),
      transport: (value) => value === 'real',
      fixtureUrl: (value) => {
        if (!value) return true;
        const fixture = new URL(value);
        return fixture.protocol === 'http:'
          && (fixture.hostname === '127.0.0.1' || fixture.hostname === 'localhost');
      },
    },
  },
  {
    pathname: '/onboarding-voice-answer',
    params: {
      state: (value) => ['idle', 'recording', 'review', 'transcribing', 'transcript', 'error'].includes(value),
      existing: (value) => ['typed', 'overLimit'].includes(value),
    },
  },
  {
    pathname: '/trial-series',
    required: ['state'],
    params: {
      state: isTrialSeriesFixtureState,
      theme: (value) => value === 'dark' || value === 'light',
    },
  },
];

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  try {
    if (__DEV__ && isQaToolsEnabled()) {
      for (const route of DEV_PREVIEW_ROUTES) {
        if (!path.startsWith(`unfold://dev${route.pathname}`)) continue;
        const preview = new URL(path);
        const keys = [...preview.searchParams.keys()];
        const fixtureUrl = preview.searchParams.get('fixtureUrl');
        const validPreview = preview.hostname === 'dev'
          && preview.pathname === route.pathname
          && (route.required ?? []).every((key) => preview.searchParams.has(key))
          && new Set(keys).size === keys.length
          && (!fixtureUrl || !route.params.fixtureUrl || preview.searchParams.get('transport') === 'real')
          && [...preview.searchParams].every(([key, value]) => route.params[key]?.(value) === true);
        if (validPreview) return path;
      }
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
