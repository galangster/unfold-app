export interface JournalMonthMarker {
  key: string;
  label: string;
  count: number;
  countLabel: string;
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
});

function monthIdentity(iso: string): { key: string; label: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { key: 'undated', label: 'Undated' };
  }

  return {
    key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    label: MONTH_FORMATTER.format(date),
  };
}

export function formatJournalEntryCount(count: number): string {
  return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

export function sortJournalItemsByDateDescending<T>(
  items: readonly T[],
  getDate: (item: T) => string,
): T[] {
  return items
    .map((item, index) => ({ item, index, timestamp: new Date(getDate(item)).getTime() }))
    .sort((a, b) => {
      const aTime = Number.isNaN(a.timestamp) ? Number.NEGATIVE_INFINITY : a.timestamp;
      const bTime = Number.isNaN(b.timestamp) ? Number.NEGATIVE_INFINITY : b.timestamp;
      return bTime - aTime || a.index - b.index;
    })
    .map(({ item }) => item);
}

export function buildJournalMonthMarkers<T>(
  items: readonly T[],
  getDate: (item: T) => string,
): (JournalMonthMarker | null)[] {
  const counts = new Map<string, number>();
  const identities = items.map((item) => monthIdentity(getDate(item)));

  for (const identity of identities) {
    counts.set(identity.key, (counts.get(identity.key) ?? 0) + 1);
  }

  return identities.map((identity, index) => {
    if (index > 0 && identities[index - 1]?.key === identity.key) {
      return null;
    }

    const count = counts.get(identity.key) ?? 0;
    return {
      ...identity,
      count,
      countLabel: formatJournalEntryCount(count),
    };
  });
}

export function formatJournalDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return String(date.getDate()).padStart(2, '0');
}
