import {
  buildJournalMonthMarkers,
  formatJournalDay,
  formatJournalEntryCount,
  sortJournalItemsByDateDescending,
} from '../journal-month-groups';

describe('journal month groups', () => {
  it('marks the first row in each source-ordered month and counts every row in that month', () => {
    const items = [
      { id: 'a', date: '2026-09-18T12:00:00' },
      { id: 'b', date: '2026-09-03T12:00:00' },
      { id: 'c', date: '2026-08-27T12:00:00' },
    ];

    expect(buildJournalMonthMarkers(items, (item) => item.date)).toEqual([
      { key: '2026-09', label: 'September 2026', count: 2, countLabel: '2 entries' },
      null,
      { key: '2026-08', label: 'August 2026', count: 1, countLabel: '1 entry' },
    ]);
    expect(items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('uses singular copy and formats the archive day without changing the date', () => {
    expect(formatJournalEntryCount(1)).toBe('1 entry');
    expect(formatJournalEntryCount(3)).toBe('3 entries');
    expect(formatJournalDay('2026-09-03T12:00:00')).toBe('03');
  });

  it('groups invalid legacy timestamps under an explicit undated heading', () => {
    expect(buildJournalMonthMarkers([{ date: '' }, { date: 'invalid' }], (item) => item.date)).toEqual([
      { key: 'undated', label: 'Undated', count: 2, countLabel: '2 entries' },
      null,
    ]);
    expect(formatJournalDay('invalid')).toBe('—');
  });

  it('sorts a noncontiguous month input into stable archive order without mutating the source', () => {
    const source = [
      { id: 'september-old', date: '2026-09-03T12:00:00' },
      { id: 'august', date: '2026-08-27T12:00:00' },
      { id: 'september-new', date: '2026-09-18T12:00:00' },
      { id: 'legacy-a', date: 'invalid' },
      { id: 'legacy-b', date: '' },
    ];

    const sorted = sortJournalItemsByDateDescending(source, (item) => item.date);
    expect(sorted.map((item) => item.id)).toEqual([
      'september-new',
      'september-old',
      'august',
      'legacy-a',
      'legacy-b',
    ]);
    expect(source.map((item) => item.id)).toEqual([
      'september-old',
      'august',
      'september-new',
      'legacy-a',
      'legacy-b',
    ]);
    expect(buildJournalMonthMarkers(sorted, (item) => item.date)).toEqual([
      { key: '2026-09', label: 'September 2026', count: 2, countLabel: '2 entries' },
      null,
      { key: '2026-08', label: 'August 2026', count: 1, countLabel: '1 entry' },
      { key: 'undated', label: 'Undated', count: 2, countLabel: '2 entries' },
      null,
    ]);
  });
});
