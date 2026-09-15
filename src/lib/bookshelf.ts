import type { Devotional } from './store';
import { countReadDays } from './book-of-seasons';
import { getServerOwnedSeriesTotalDays } from './devotional-series-boundary';
import { isOnboardingFirstReading } from './auto-trial-series';

export function firstReadingLabel(book: Pick<Devotional, 'seriesArc'>): string | undefined {
  return isOnboardingFirstReading(book) ? 'Your first devotional' : undefined;
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
