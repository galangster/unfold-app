/**
 * Bible API Client
 *
 * Fetches full verse text from bible-api.com (free, no API key required).
 * Results are cached in MMKV with infinite TTL since verse text never changes.
 *
 * Used by the Contextual Scripture Tap feature to display verse text
 * when a user taps a detected scripture reference.
 */

import { MMKV } from 'react-native-mmkv';
import { logger } from '@/lib/logger';

// ---------- Types ----------

export interface VerseResult {
  /** The canonical reference string, e.g. "John 3:16" */
  reference: string;
  /** The full verse text */
  text: string;
  /** Translation abbreviation, e.g. "web" or "kjv" */
  translation: string;
}

/** Shape of the bible-api.com JSON response */
interface BibleApiResponse {
  reference: string;
  verses: Array<{
    book_id: string;
    book_name: string;
    chapter: number;
    verse: number;
    text: string;
  }>;
  text: string;
  translation_id: string;
  translation_name: string;
  translation_note: string;
}

/** Input for generating AI commentary on a scripture passage */
export interface CommentaryInput {
  reference: string;
  verseText: string;
  todayTheme: string;
  todayTitle: string;
}

/** Result of commentary generation */
export interface CommentaryResult {
  commentary: string;
}

// ---------- Constants ----------

const BIBLE_API_BASE_URL = 'https://bible-api.com';
const DEFAULT_TRANSLATION = 'web';
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_KEY_PREFIX = 'verse';
const COMMENTARY_CACHE_PREFIX = 'commentary';
const RAILWAY_BACKEND_URL = 'https://unfold-backend-production.up.railway.app';

// ---------- Cache ----------

/**
 * Dedicated MMKV instance for Bible verse caching.
 * Separate from the Zustand store instance to keep concerns isolated.
 * Infinite TTL — verse text is immutable.
 */
const verseCache = new MMKV({ id: 'unfold-verse-cache' });

/**
 * Build a deterministic cache key for a verse lookup.
 *
 * @example buildCacheKey("John 3:16", "web") => "verse_john 3:16_web"
 */
function buildCacheKey(reference: string, translation: string): string {
  return `${CACHE_KEY_PREFIX}_${reference.toLowerCase()}_${translation.toLowerCase()}`;
}

/**
 * Attempt to retrieve a cached verse result.
 */
function getCachedVerse(reference: string, translation: string): VerseResult | null {
  const key = buildCacheKey(reference, translation);
  const raw = verseCache.getString(key);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as VerseResult;
  } catch {
    // Corrupted cache entry — delete it and return null
    verseCache.delete(key);
    return null;
  }
}

/**
 * Store a verse result in the cache.
 */
function setCachedVerse(reference: string, translation: string, result: VerseResult): void {
  const key = buildCacheKey(reference, translation);
  verseCache.set(key, JSON.stringify(result));
}

// ---------- API ----------

/**
 * Fetch the full text of a Bible verse or passage from bible-api.com.
 *
 * @param reference - A scripture reference string, e.g. "John 3:16", "Romans 8:28-30"
 * @param translation - Translation code. Defaults to "web" (World English Bible).
 *                       Also supports "kjv" (King James Version).
 * @returns The verse text and metadata, or null if the fetch failed or the reference was not found.
 *
 * @example
 * ```ts
 * const verse = await fetchVerse("John 3:16");
 * if (verse) {
 *   console.log(verse.text);
 *   // "For God so loved the world, that he gave his one and only Son, ..."
 * }
 * ```
 */
export async function fetchVerse(
  reference: string,
  translation: string = DEFAULT_TRANSLATION,
): Promise<VerseResult | null> {
  // Check cache first
  const cached = getCachedVerse(reference, translation);
  if (cached) {
    logger.log('[BibleAPI] Cache hit:', reference, translation);
    return cached;
  }

  logger.log('[BibleAPI] Cache miss, fetching:', reference, translation);

  // Build the URL: replace spaces with '+' per bible-api.com convention
  const encodedRef = encodeURIComponent(reference);
  const url = `${BIBLE_API_BASE_URL}/${encodedRef}?translation=${translation}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn(
        '[BibleAPI] Non-OK response:',
        response.status,
        response.statusText,
        'for',
        reference,
      );
      return null;
    }

    const data: BibleApiResponse = await response.json();

    // bible-api.com returns the combined text in the `text` field
    // Trim whitespace and normalize line breaks
    const cleanText = data.text
      .replace(/\r\n/g, '\n')
      .trim();

    if (!cleanText) {
      logger.warn('[BibleAPI] Empty text returned for:', reference);
      return null;
    }

    const result: VerseResult = {
      reference: data.reference,
      text: cleanText,
      translation: data.translation_id ?? translation,
    };

    // Cache the result (infinite TTL — verse text is immutable)
    setCachedVerse(reference, translation, result);
    logger.log('[BibleAPI] Fetched and cached:', result.reference);

    return result;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn('[BibleAPI] Request timed out after', FETCH_TIMEOUT_MS, 'ms for:', reference);
    } else {
      logger.error('[BibleAPI] Fetch error for', reference, error);
    }

    return null;
  }
}

// ---------- AI Commentary ----------

/**
 * Build a cache key for commentary on a verse in the context of a devotional day.
 */
function buildCommentaryCacheKey(reference: string, todayTitle: string): string {
  return `${COMMENTARY_CACHE_PREFIX}_${reference.toLowerCase()}_${todayTitle.toLowerCase().slice(0, 40)}`;
}

/**
 * Fetch cached commentary for a scripture reference + devotional day.
 */
function getCachedCommentary(reference: string, todayTitle: string): string | null {
  const key = buildCommentaryCacheKey(reference, todayTitle);
  return verseCache.getString(key) ?? null;
}

/**
 * Store commentary in the cache.
 */
function setCachedCommentary(reference: string, todayTitle: string, text: string): void {
  const key = buildCommentaryCacheKey(reference, todayTitle);
  verseCache.set(key, text);
}

/**
 * Generate a short AI commentary connecting a scripture passage to today's
 * devotional theme. Uses the Railway backend with Grok for fast, cheap generation.
 *
 * Returns 2-3 sentences (~40-60 words) or null on failure.
 * Results are cached in MMKV per reference+day.
 */
export async function fetchCommentary(input: CommentaryInput): Promise<string | null> {
  const cached = getCachedCommentary(input.reference, input.todayTitle);
  if (cached) {
    logger.log('[BibleAPI] Commentary cache hit:', input.reference);
    return cached;
  }

  logger.log('[BibleAPI] Generating commentary for:', input.reference);

  const backendUrl =
    process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || RAILWAY_BACKEND_URL;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${backendUrl}/api/generate-commentary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference: input.reference,
        verseText: input.verseText,
        todayTheme: input.todayTheme,
        todayTitle: input.todayTitle,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn('[BibleAPI] Commentary generation failed:', response.status);
      return null;
    }

    const data = await response.json();
    const commentary = data.commentary;

    if (!commentary || typeof commentary !== 'string') {
      logger.warn('[BibleAPI] Invalid commentary response');
      return null;
    }

    setCachedCommentary(input.reference, input.todayTitle, commentary);
    logger.log('[BibleAPI] Commentary generated and cached:', input.reference);

    return commentary;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn('[BibleAPI] Commentary request timed out for:', input.reference);
    } else {
      logger.error('[BibleAPI] Commentary error for', input.reference, error);
    }

    return null;
  }
}
