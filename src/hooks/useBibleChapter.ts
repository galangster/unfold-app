/**
 * useBibleChapter — React Query wrapper for reading a Bible chapter
 *
 * Fetches all verses for a given book/chapter/translation from the local
 * SQLite database. Pre-fetches adjacent chapters for smooth navigation.
 *
 * Usage (object form):
 *   const { verses, isLoading } = useBibleChapter({ bookId: 43, chapter: 3 });
 *
 * Usage (positional form):
 *   const { data: verses, isLoading } = useBibleChapter(43, 3, 'BSB');
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getChapter,
  openBibleDb,
  type BibleVerse,
  type BibleTranslation,
} from '@/lib/bible-db';
import { BOOK_BY_ID, getNextChapter, getPreviousChapter } from '@/lib/bible-constants';
import { logger } from '@/lib/logger';
import { useBibleDb } from './useBibleDb';

// ─── Query key factory ───────────────────────────────────────────────────────

export const bibleChapterKeys = {
  all: ['bible-chapter'] as const,
  chapter: (bookId: number, chapter: number, translation: BibleTranslation) =>
    ['bible-chapter', bookId, chapter, translation] as const,
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UseBibleChapterOptions {
  bookId: number;
  chapter: number;
  translation?: BibleTranslation;
  /** Disable pre-fetching of adjacent chapters (defaults to true) */
  prefetch?: boolean;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Fetch all verses for a Bible chapter.
 *
 * Accepts either an options object or positional arguments:
 *   useBibleChapter({ bookId, chapter, translation })
 *   useBibleChapter(bookId, chapter, translation)
 */
export function useBibleChapter(
  bookIdOrOptions: number | UseBibleChapterOptions,
  chapterArg?: number,
  translationArg?: BibleTranslation,
  prefetchArg?: boolean,
) {
  // Normalize arguments: support both object and positional forms
  let bookId: number;
  let chapter: number;
  let translation: BibleTranslation;
  let prefetch: boolean;

  if (typeof bookIdOrOptions === 'object') {
    bookId = bookIdOrOptions.bookId;
    chapter = bookIdOrOptions.chapter;
    translation = bookIdOrOptions.translation ?? 'BSB';
    prefetch = bookIdOrOptions.prefetch ?? true;
  } else {
    bookId = bookIdOrOptions;
    chapter = chapterArg ?? 1;
    translation = translationArg ?? 'BSB';
    prefetch = prefetchArg ?? true;
  }

  const { isReady } = useBibleDb();
  const queryClient = useQueryClient();

  const bookInfo = BOOK_BY_ID[bookId] ?? null;

  // Eagerly open the DB connection as soon as it's marked ready,
  // so the first query doesn't have to wait for SQLite cold-start
  useEffect(() => {
    if (isReady) {
      openBibleDb().catch(() => {});
    }
  }, [isReady]);

  const queryResult = useQuery<BibleVerse[]>({
    queryKey: bibleChapterKeys.chapter(bookId, chapter, translation),
    queryFn: async () => {
      const verses = await getChapter(bookId, chapter, translation);
      if (verses.length === 0) {
        logger.warn('[useBibleChapter] No verses returned for', {
          bookId,
          chapter,
          translation,
        });
      }
      return verses;
    },
    enabled: isReady && bookId >= 1 && bookId <= 66 && chapter >= 1,
    staleTime: Infinity, // Bible text never changes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    retry: 2, // Retry on cold-start failures
  });

  // Pre-fetch adjacent chapters for smooth swiping/navigation
  useEffect(() => {
    if (!isReady || !prefetch) return;

    const prefetchChapter = (bId: number, ch: number) => {
      const key = bibleChapterKeys.chapter(bId, ch, translation);
      // Only prefetch if not already in cache
      const existing = queryClient.getQueryData(key);
      if (!existing) {
        queryClient.prefetchQuery({
          queryKey: key,
          queryFn: () => getChapter(bId, ch, translation),
          staleTime: Infinity,
        });
      }
    };

    const next = getNextChapter(bookId, chapter);
    if (next) {
      prefetchChapter(next.bookId, next.chapter);
    }

    const prev = getPreviousChapter(bookId, chapter);
    if (prev) {
      prefetchChapter(prev.bookId, prev.chapter);
    }
  }, [isReady, prefetch, bookId, chapter, translation, queryClient]);

  return {
    /** Verses for the requested chapter, or undefined while loading */
    data: queryResult.data,
    /** Verses (empty array fallback) */
    verses: queryResult.data ?? [],
    /** True while the initial load is in progress */
    isLoading: queryResult.isLoading,
    /** True if the query failed */
    isError: queryResult.isError,
    /** Error message if the query failed */
    error: queryResult.error instanceof Error ? queryResult.error.message : null,
    /** Book name for display (e.g., "John") */
    bookName: bookInfo?.name ?? null,
    /** Total chapters in this book for navigation bounds */
    totalChapters: bookInfo?.chapterCount ?? 0,
    /** Re-fetch data */
    refetch: queryResult.refetch,
  };
}
