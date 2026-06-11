/**
 * useBibleSearch — Debounced FTS5 Bible Search Hook
 *
 * Provides a debounced search interface for the offline Bible database.
 * Uses FTS5 full-text search with the Porter stemmer for English-aware matching.
 *
 * Supports two calling conventions:
 *
 * 1. Options object (manages query state internally):
 *   const { query, setQuery, results, isSearching } = useBibleSearch({
 *     translation: 'BSB',
 *   });
 *
 * 2. Positional args (external query state):
 *   const { results, isSearching } = useBibleSearch(query, 'BSB');
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  searchBible,
  type BibleSearchResult as BibleSearchResultRaw,
  type BibleTranslation,
} from '@/lib/bible-db';
import { BOOK_BY_ID, formatScriptureReference } from '@/lib/bible-constants';
import { logger } from '@/lib/logger';
import { useBibleDb } from './useBibleDb';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Search result with book name and formatted reference appended */
export interface BibleSearchResultWithMeta extends BibleSearchResultRaw {
  /** Book name for display (e.g., "John") */
  bookName: string;
  /** Formatted reference (e.g., "John 3:16") */
  reference: string;
}

// Re-export under both names for backward compatibility
export type BibleSearchResult = BibleSearchResultWithMeta;

export interface UseBibleSearchOptions {
  /** Filter results to a specific translation, or omit for both */
  translation?: BibleTranslation;
  /** Maximum number of results (defaults to 50) */
  limit?: number;
  /** Debounce delay in ms (defaults to 300) */
  debounceMs?: number;
}

// ─── Query key factory ───────────────────────────────────────────────────────

export const bibleSearchKeys = {
  all: ['bible-search'] as const,
  search: (query: string, translation: BibleTranslation | undefined, limit: number) =>
    ['bible-search', query, translation ?? 'all', limit] as const,
};

// ─── Debounce hook ───────────────────────────────────────────────────────────

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

// ─── Core search logic ──────────────────────────────────────────────────────

function useBibleSearchCore(
  rawQuery: string,
  translation: BibleTranslation | undefined,
  limit: number,
  debounceMs: number,
) {
  const { isReady } = useBibleDb();
  const debouncedQuery = useDebouncedValue(rawQuery.trim(), debounceMs);

  // Minimum query length for search (avoid overly broad queries)
  const isQueryValid = debouncedQuery.length >= 2;

  const { data, isLoading, isError, error } = useQuery<BibleSearchResultRaw[]>({
    queryKey: bibleSearchKeys.search(debouncedQuery, translation, limit),
    queryFn: async () => {
      logger.log('[useBibleSearch] Searching:', debouncedQuery);
      return searchBible(debouncedQuery, translation, limit);
    },
    enabled: isReady && isQueryValid,
    staleTime: 5 * 60 * 1000, // Cache search results for 5 minutes
    gcTime: 10 * 60 * 1000,
    placeholderData: (previousData) => previousData, // Keep previous results while loading new ones
  });

  // Enrich results with book names and formatted references
  const enrichedResults = useMemo<BibleSearchResultWithMeta[]>(() => {
    if (!data) return [];

    return data.map((result) => {
      const book = BOOK_BY_ID[result.bookId];
      const bookName = book?.name ?? `Book ${result.bookId}`;
      const reference = formatScriptureReference(bookName, result.chapter, result.verse);

      return {
        ...result,
        bookName,
        reference,
      };
    });
  }, [data]);

  return {
    results: enrichedResults,
    isSearching: isLoading && isQueryValid,
    isPending: rawQuery.trim() !== debouncedQuery,
    error: isError && error instanceof Error ? error.message : null,
    debouncedQuery,
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Debounced FTS5 Bible search.
 *
 * Options-object form (internal query state):
 *   useBibleSearch({ translation: 'BSB' })
 *   Returns: { query, setQuery, results, isSearching, ... }
 *
 * Positional form (external query state):
 *   useBibleSearch(query, translation, limit)
 *   Returns: { results, isSearching, data, ... }
 */
export function useBibleSearch(
  queryOrOptions: string | UseBibleSearchOptions,
  translationArg?: BibleTranslation,
  limitArg?: number,
) {
  // Determine if we're in "managed query state" mode (options object)
  // or "external query" mode (positional args)
  const isOptionsMode = typeof queryOrOptions !== 'string';

  // Internal query state for options-object mode
  const [internalQuery, setInternalQuery] = useState<string>('');

  // Resolve parameters based on calling convention
  const rawQuery = isOptionsMode ? internalQuery : queryOrOptions;
  const translation = isOptionsMode
    ? (queryOrOptions as UseBibleSearchOptions).translation
    : translationArg;
  const limit = isOptionsMode
    ? ((queryOrOptions as UseBibleSearchOptions).limit ?? 50)
    : (limitArg ?? 50);
  const debounceMs = isOptionsMode
    ? ((queryOrOptions as UseBibleSearchOptions).debounceMs ?? 300)
    : 300;

  const core = useBibleSearchCore(rawQuery, translation, limit, debounceMs);

  // Clear function for options mode
  const clear = () => {
    setInternalQuery('');
  };

  return {
    // Always returned
    results: core.results,
    isSearching: core.isSearching,
    isPending: core.isPending,
    error: core.error,
    debouncedQuery: core.debouncedQuery,
    data: core.results,

    // Only meaningful in options-object mode, but always returned for type safety
    query: rawQuery,
    setQuery: isOptionsMode ? setInternalQuery : (() => {}),
    clear,
  };
}
