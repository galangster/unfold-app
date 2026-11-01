import type { Devotional } from './store';
import { countReadDays } from './book-of-seasons';
import { getServerOwnedSeriesTotalDays } from './devotional-series-boundary';
import { isFirstReadingRow, ONBOARDING_FIRST_READING_SERIES_NAME } from './auto-trial-series';

/** The shelf label reads in sentence case: "Your first devotional". */
const FIRST_READING_LABEL = ONBOARDING_FIRST_READING_SERIES_NAME.charAt(0)
  + ONBOARDING_FIRST_READING_SERIES_NAME.slice(1).toLowerCase();

export function firstReadingLabel(book: Pick<Devotional, 'id' | 'seriesArc'>): string | undefined {
  return isFirstReadingRow(book) ? FIRST_READING_LABEL : undefined;
}

export type ShelfFilter = 'all' | 'progress' | 'completed';

export function seriesReadingProgress(series: Devotional) {
  const total = getServerOwnedSeriesTotalDays(series);
  const read = countReadDays(series.days, 1, total);
  return { total, read, complete: total > 0 && read === total };
}

export function filterShelf(series: readonly Devotional[], filter: ShelfFilter, search: string): Devotional[] {
  const query = search.trim().toLocaleLowerCase();
  return series.filter((book) => {
    const { complete } = seriesReadingProgress(book);
    if (filter === 'completed' && !complete || filter === 'progress' && complete) return false;
    return !query || [firstReadingLabel(book), book.title, ...book.days.flatMap(day => [day.title, day.scriptureReference])]
      .filter(Boolean).join(' ').toLocaleLowerCase().includes(query);
  }).sort((a, b) => {
    const time = (value: string) => { const n = Date.parse(value); return Number.isFinite(n) ? n : 0; };
    return time(b.createdAt) - time(a.createdAt) || a.id.localeCompare(b.id);
  });
}

export function resolveShelfSelection(books: readonly Pick<Devotional, 'id'>[], selectedId: string | null, previousIndex: number): number {
  const index = books.findIndex(book => book.id === selectedId);
  return index >= 0 ? index : Math.max(0, Math.min(previousIndex, books.length - 1));
}
