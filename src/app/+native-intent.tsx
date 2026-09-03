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

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  try {
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
