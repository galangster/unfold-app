/**
 * Story service — fetches curated illustration material from the backend.
 *
 * Used by the generation engine to inject real stories (psychology, literature,
 * biblical, church history, etc.) into devotional prompts.
 *
 * Caching: React Query with 24h staleTime (stories are reference data).
 * Fallback: Returns empty array on failure — generation works without stories.
 */

import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';
import { logger } from '@/lib/logger';

export interface StoryResult {
  id: string;
  title: string;
  era: string;
  category: string;
  themes: string[];
  oneLineSummary: string;
  spiritualAngle: string | null;
  scriptureConnection: string | null;
  specificReference: string | null;
  source: string;
  spinnable: boolean;
}

interface StoriesResponse {
  stories: StoryResult[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Fetch stories matching themes from the backend.
 * Used during devotional generation to inject real illustrations.
 *
 * @param themes - Theme tags to match (any match counts)
 * @param options - Optional filters
 * @returns Array of matching stories (empty on failure)
 */
export async function fetchStoriesForGeneration(
  themes: string[],
  options: {
    category?: string;
    limit?: number;
    spinnable?: boolean;
    exclude?: string[];
  } = {}
): Promise<StoryResult[]> {
  const { category, limit = 5, spinnable = true, exclude } = options;

  try {
    const params = new URLSearchParams();
    if (themes.length > 0) params.set('themes', themes.join(','));
    if (category) params.set('category', category);
    if (spinnable !== undefined) params.set('spinnable', String(spinnable));
    params.set('limit', String(limit));
    params.set('random', 'true');
    if (exclude?.length) {
      params.set('exclude', exclude.join(','));
    }

    const headers = await getAuthHeaders();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `${PRIMARY_BACKEND_URL}/api/stories?${params.toString()}`,
      { headers, signal: controller.signal }
    );

    clearTimeout(timeout);

    if (!res.ok) {
      logger.warn('[story-service] Failed to fetch stories:', res.status);
      return [];
    }

    const data: StoriesResponse = await res.json();
    return data.stories;
  } catch (err) {
    // Network error, timeout, or abort — fail silently
    logger.warn('[story-service] Story fetch failed (using generation without stories):', err);
    return [];
  }
}

/**
 * Format stories for prompt injection.
 * Produces a compact text block suitable for system prompt inclusion.
 */
export function formatStoriesForPrompt(stories: StoryResult[]): string {
  if (stories.length === 0) return '';

  const lines = stories.map((s, i) => {
    let entry = `${i + 1}. "${s.title}" (${s.era})`;
    entry += `\n   ${s.oneLineSummary}`;
    if (s.spiritualAngle) {
      entry += `\n   Angle: ${s.spiritualAngle}`;
    }
    if (s.scriptureConnection) {
      entry += `\n   Scripture: ${s.scriptureConnection}`;
    }
    if (s.specificReference) {
      entry += `\n   Source: ${s.specificReference}`;
    }
    return entry;
  });

  return `AVAILABLE ILLUSTRATIONS (use one or be inspired by them — do NOT copy verbatim):\n${lines.join('\n\n')}`;
}
