import type { Devotional } from '@/lib/store';

/**
 * Canonical/progressive devotionals must use the queued day-generation API.
 * The legacy direct continuation path calls /api/generate/devotional and can
 * create local-only future days that were never persisted by the backend.
 */
export function isCanonicalProgressiveDevotional(devotional?: Devotional | null): boolean {
  if (!devotional) return false;

  return Boolean(
    devotional.generationMode === 'progressive' ||
      devotional.seriesArc ||
      devotional.progressiveMemory ||
      devotional.seriesStartDate
  );
}

/**
 * Keep the legacy direct continuation path only for old/plain batch journeys.
 */
export function shouldUseLegacyDirectContinuation(devotional?: Devotional | null): boolean {
  return Boolean(devotional && !isCanonicalProgressiveDevotional(devotional));
}
