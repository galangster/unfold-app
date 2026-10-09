/**
 * Journal rows synced before entry ids were day-derived still sit on the
 * server under random per-device ids. The v41→42 migration merges the copies
 * a device already holds, but the pull is what brings the server's copies
 * back — and it upserts by id, so without a day-level collapse the duplicates
 * the migration just merged reappear on the very next sync.
 */
jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
}));

jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => store.set(key, value)),
      removeItem: jest.fn((key: string) => store.delete(key)),
    },
    getDeviceId: jest.fn(() => 'test-device-id'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    isRecoverySession: jest.fn(() => false),
  };
});

import { applyPulledUserData } from '../full-sync-pull';
import { canonicalJournalEntryId } from '../journal-entry-merge';
import { mmkvStorage } from '../mmkv-storage';
import { useUnfoldStore } from '../store';
import { enqueueSyncChanges, OUTBOX_KEY, peekSyncOutbox } from '../sync-outbox';

const DEVOTIONAL = 'dev-1';
const DAY = 3;

/** A journal row as /api/sync/pull returns it, under a legacy random id. */
function legacyRow(id: string, content: string, updatedAt: string) {
  return {
    id,
    data: {
      id,
      devotionalId: DEVOTIONAL,
      dayNumber: DAY,
      content,
      journalMode: 'freewrite',
      soapResponses: null,
      questionResponses: null,
      prayerRequests: null,
      deeperQuestions: null,
      createdAt: '2026-09-01T08:00:00.000Z',
      updatedAt,
      clientUpdatedAt: updatedAt,
      deletedAt: null,
    },
    updatedAt,
    deleted: false,
  };
}

function seedCanonicalEntry(content: string, updatedAt: string) {
  const id = canonicalJournalEntryId(DEVOTIONAL, DAY);
  useUnfoldStore.setState({
    journalEntries: [
      {
        id,
        devotionalId: DEVOTIONAL,
        dayNumber: DAY,
        content,
        journalMode: 'freewrite',
        createdAt: '2026-09-01T08:00:00.000Z',
        updatedAt,
      },
    ],
  } as never);
  return id;
}

beforeEach(() => {
  useUnfoldStore.getState().reset();
});

describe('pulling journal rows minted under legacy ids', () => {
  it('folds a legacy-id row into the day it belongs to instead of adding a second entry', () => {
    const canonical = seedCanonicalEntry('Written after the upgrade.', '2026-09-02T10:00:00.000Z');

    applyPulledUserData({
      changes: {
        journal_entries: [legacyRow('journal_a1b2c3', 'Written on the old device.', '2026-09-01T09:00:00.000Z')],
      },
      timestamp: '2026-09-02T11:00:00.000Z',
    } as never);

    const days = useUnfoldStore
      .getState()
      .journalEntries.filter((item) => item.devotionalId === DEVOTIONAL && item.dayNumber === DAY);
    expect(days).toHaveLength(1);
    expect(days[0].id).toBe(canonical);
    // Neither side's writing is dropped by the fold.
    expect(days[0].content).toContain('Written on the old device.');
    expect(days[0].content).toContain('Written after the upgrade.');
  });

  it('collapses two legacy rows for the same day into one entry', () => {
    applyPulledUserData({
      changes: {
        journal_entries: [
          legacyRow('journal_one', 'Phone.', '2026-09-01T09:00:00.000Z'),
          legacyRow('journal_two', 'Tablet.', '2026-09-01T09:30:00.000Z'),
        ],
      },
      timestamp: '2026-09-02T11:00:00.000Z',
    } as never);

    const entries = useUnfoldStore.getState().journalEntries;
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(canonicalJournalEntryId(DEVOTIONAL, DAY));
    expect(entries[0].content).toContain('Phone.');
    expect(entries[0].content).toContain('Tablet.');
  });

  it('leaves entries for other days alone', () => {
    seedCanonicalEntry('Day three.', '2026-09-02T10:00:00.000Z');
    const otherDayId = canonicalJournalEntryId(DEVOTIONAL, 4);
    useUnfoldStore.setState({
      journalEntries: [
        ...useUnfoldStore.getState().journalEntries,
        {
          id: otherDayId,
          devotionalId: DEVOTIONAL,
          dayNumber: 4,
          content: 'Day four.',
          journalMode: 'freewrite',
          createdAt: '2026-09-01T08:00:00.000Z',
          updatedAt: '2026-09-02T10:00:00.000Z',
        },
      ],
    } as never);

    applyPulledUserData({
      changes: {
        journal_entries: [legacyRow('journal_legacy', 'Day three, other device.', '2026-09-01T09:00:00.000Z')],
      },
      timestamp: '2026-09-02T11:00:00.000Z',
    } as never);

    const entries = useUnfoldStore.getState().journalEntries;
    expect(entries).toHaveLength(2);
    expect(entries.find((item) => item.dayNumber === 4)?.content).toBe('Day four.');
  });
});

describe('pushing the writing a pull folded together', () => {
  beforeEach(() => {
    mmkvStorage.removeItem(OUTBOX_KEY);
  });

  const queuedJournal = () => peekSyncOutbox().filter((change) => change.table === 'journal_entries');

  function pullLegacyRow() {
    applyPulledUserData({
      changes: {
        journal_entries: [legacyRow('journal_a1b2c3', 'Written on the old device.', '2026-09-01T09:00:00.000Z')],
      },
      timestamp: '2026-09-02T11:00:00.000Z',
    } as never);
  }

  it('queues the folded day under its canonical id, so the server holds both pieces of writing', () => {
    const canonical = seedCanonicalEntry('Written after the upgrade.', '2026-09-02T10:00:00.000Z');

    pullLegacyRow();

    const queued = queuedJournal();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ id: canonical, deleted: false });
    expect(queued[0].data.content).toContain('Written on the old device.');
    expect(queued[0].data.content).toContain('Written after the upgrade.');
    // The entry carries the clock of its queued change.
    const day = useUnfoldStore.getState().journalEntries.find((item) => item.id === canonical);
    expect(day?.updatedAt).toBe(queued[0].clientUpdatedAt);
  });

  it('queues a legacy entry the collapse moved to its canonical id without merging anything into it', () => {
    const canonical = seedCanonicalEntry('Written after the upgrade.', '2026-09-02T10:00:00.000Z');
    const otherDay = { ...legacyRow('journal_day_four', 'Day four, old device.', '2026-09-01T09:00:00.000Z') };
    otherDay.data = { ...otherDay.data, dayNumber: 4 };

    applyPulledUserData({
      changes: {
        journal_entries: [
          legacyRow('journal_a1b2c3', 'Written on the old device.', '2026-09-01T09:00:00.000Z'),
          otherDay,
        ],
      },
      timestamp: '2026-09-02T11:00:00.000Z',
    } as never);

    expect(queuedJournal().map((change) => change.id).sort()).toEqual(
      [canonical, canonicalJournalEntryId(DEVOTIONAL, 4)].sort(),
    );
    expect(queuedJournal().find((change) => change.id === canonicalJournalEntryId(DEVOTIONAL, 4))?.data.content)
      .toBe('Day four, old device.');
  });

  it('does not queue the day again when the same legacy row arrives again', () => {
    seedCanonicalEntry('Written after the upgrade.', '2026-09-02T10:00:00.000Z');
    pullLegacyRow();
    // The push landed.
    mmkvStorage.removeItem(OUTBOX_KEY);

    pullLegacyRow();

    expect(queuedJournal()).toEqual([]);
  });

  it('queues the repair past a change already queued for the day, even with the device clock behind it', () => {
    const canonical = seedCanonicalEntry('Edited here, not pushed yet.', '2026-09-02T10:00:00.000Z');
    enqueueSyncChanges([{
      table: 'journal_entries',
      id: canonical,
      clientUpdatedAt: '2099-01-01T00:00:00.000Z',
      data: { devotionalId: DEVOTIONAL, dayNumber: DAY, content: 'Edited here, not pushed yet.' },
      deleted: false,
    }]);

    pullLegacyRow();

    const queued = queuedJournal();
    expect(queued).toHaveLength(1);
    expect(queued[0].clientUpdatedAt).toBe('2099-01-01T00:00:00.001Z');
    expect(queued[0].data.content).toContain('Written on the old device.');
    expect(queued[0].data.content).toContain('Edited here, not pushed yet.');
  });

  it('queues the repair past the rows it folds', () => {
    seedCanonicalEntry('Written after the upgrade.', '2026-09-02T10:00:00.000Z');

    applyPulledUserData({
      changes: { journal_entries: [legacyRow('journal_ahead', 'From a clock ahead.', '2099-06-01T00:00:00.000Z')] },
      timestamp: '2099-06-01T00:00:01.000Z',
    } as never);

    expect(queuedJournal().map((change) => change.clientUpdatedAt)).toEqual(['2099-06-01T00:00:00.001Z']);
  });

  it('queues a later edit past a repair dated ahead of this phone, so the edit is what gets pushed', () => {
    const canonical = seedCanonicalEntry('Written after the upgrade.', '2026-09-02T10:00:00.000Z');
    applyPulledUserData({
      changes: { journal_entries: [legacyRow('journal_ahead', 'From a clock ahead.', '2099-06-01T00:00:00.000Z')] },
      timestamp: '2099-06-01T00:00:01.000Z',
    } as never);

    useUnfoldStore.getState().updateJournalEntry(canonical, 'Typed after the repair.');

    const queued = queuedJournal();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ id: canonical, clientUpdatedAt: '2099-06-01T00:00:00.002Z' });
    expect(queued[0].data.content).toBe('Typed after the repair.');
  });

  it('stamps an edit of a row dated ahead of this phone past that row', () => {
    const canonical = canonicalJournalEntryId(DEVOTIONAL, DAY);
    applyPulledUserData({
      changes: { journal_entries: [legacyRow(canonical, 'From a clock ahead.', '2099-06-01T00:00:00.000Z')] },
      timestamp: '2099-06-01T00:00:01.000Z',
    } as never);

    useUnfoldStore.getState().updateJournalEntry(canonical, 'Edited here.');

    expect(queuedJournal().map((change) => change.clientUpdatedAt)).toEqual(['2099-06-01T00:00:00.001Z']);
  });

  it('leaves a queued delete of the day in place', () => {
    const canonical = canonicalJournalEntryId(DEVOTIONAL, DAY);
    enqueueSyncChanges([{ table: 'journal_entries', id: canonical, clientUpdatedAt: '2026-09-05T00:00:00.000Z', data: {}, deleted: true }]);

    applyPulledUserData({
      changes: {
        journal_entries: [
          legacyRow('journal_one', 'Phone.', '2026-09-01T09:00:00.000Z'),
          legacyRow('journal_two', 'Tablet.', '2026-09-01T09:30:00.000Z'),
        ],
      },
      timestamp: '2026-09-02T11:00:00.000Z',
    } as never);

    expect(queuedJournal()).toEqual([expect.objectContaining({ id: canonical, deleted: true })]);
  });

  it('queues no repair for a day whose entry the same pull deletes', () => {
    const canonical = seedCanonicalEntry('Written after the upgrade.', '2026-09-02T10:00:00.000Z');

    applyPulledUserData({
      changes: {
        journal_entries: [
          { ...legacyRow(canonical, '', '2026-09-05T00:00:00.000Z'), deleted: true },
          legacyRow('journal_one', 'Phone.', '2026-09-01T09:00:00.000Z'),
          legacyRow('journal_two', 'Tablet.', '2026-09-01T09:30:00.000Z'),
        ],
      },
      timestamp: '2026-09-05T00:00:01.000Z',
    } as never);

    expect(queuedJournal()).toEqual([]);
  });

  it('still repairs a day when the pulled delete is older than a change queued here', () => {
    const canonical = seedCanonicalEntry('Written after the upgrade.', '2026-09-06T00:00:00.000Z');
    enqueueSyncChanges([{
      table: 'journal_entries',
      id: canonical,
      clientUpdatedAt: '2026-09-06T00:00:00.000Z',
      data: { content: 'Written after the upgrade.' },
      deleted: false,
    }]);

    applyPulledUserData({
      changes: {
        journal_entries: [
          { ...legacyRow(canonical, '', '2026-09-05T00:00:00.000Z'), deleted: true },
          legacyRow('journal_one', 'Phone.', '2026-09-01T09:00:00.000Z'),
        ],
      },
      timestamp: '2026-09-06T00:00:01.000Z',
    } as never);

    const queued = queuedJournal();
    expect(queued).toEqual([expect.objectContaining({ id: canonical, deleted: false })]);
    expect(queued[0].data.content).toContain('Written after the upgrade.');
    expect(queued[0].data.content).toContain('Phone.');
  });

  function seedSeries() {
    useUnfoldStore.setState({ devotionals: [{ id: DEVOTIONAL, title: 'Series', currentDay: DAY, totalDays: 7, days: [] }] } as never);
  }

  // The outbox is written at once and the store's disk a moment later, so a
  // crash in between leaves the newest writing only in the queued change.
  function queueWriteLostFromStore(content: string, clientUpdatedAt: string) {
    const canonical = canonicalJournalEntryId(DEVOTIONAL, DAY);
    enqueueSyncChanges([{
      table: 'journal_entries',
      id: canonical,
      clientUpdatedAt,
      data: { devotionalId: DEVOTIONAL, dayNumber: DAY, content, journalMode: 'freewrite' },
      deleted: false,
    }]);
    return canonical;
  }

  it('keeps writing whose row a crash lost when a pull brings an older delete and legacy rows', () => {
    seedSeries();
    const canonical = queueWriteLostFromStore('Written just before the crash.', '2026-09-06T00:00:00.000Z');

    applyPulledUserData({
      changes: {
        journal_entries: [
          { ...legacyRow(canonical, '', '2026-09-05T00:00:00.000Z'), deleted: true },
          legacyRow('journal_one', 'Phone.', '2026-09-01T09:00:00.000Z'),
          legacyRow('journal_two', 'Tablet.', '2026-09-01T09:30:00.000Z'),
        ],
      },
      timestamp: '2026-09-06T00:00:01.000Z',
    } as never);

    const queued = queuedJournal();
    expect(queued).toEqual([expect.objectContaining({ id: canonical, deleted: false })]);
    expect(queued[0].clientUpdatedAt > '2026-09-06T00:00:00.000Z').toBe(true);
    for (const text of ['Written just before the crash.', 'Phone.', 'Tablet.']) {
      expect(queued[0].data.content).toContain(text);
    }
    const entry = useUnfoldStore.getState().journalEntries.find((item) => item.id === canonical);
    expect(entry?.content).toContain('Written just before the crash.');
  });

  it('folds the queued writing, not the older row the store kept, when a pull folds the day', () => {
    seedSeries();
    seedCanonicalEntry('Old draft.', '2026-09-02T10:00:00.000Z');
    const canonical = queueWriteLostFromStore('Old draft. Written just before the crash.', '2026-09-06T00:00:00.000Z');

    applyPulledUserData({
      changes: { journal_entries: [legacyRow('journal_one', 'Phone.', '2026-09-01T09:00:00.000Z')] },
      timestamp: '2026-09-06T00:00:01.000Z',
    } as never);

    const queued = queuedJournal();
    expect(queued).toHaveLength(1);
    expect(queued[0].data.content).toContain('Written just before the crash.');
    expect(queued[0].data.content).toContain('Phone.');
    const entry = useUnfoldStore.getState().journalEntries.find((item) => item.id === canonical);
    expect(entry?.createdAt).toBe('2026-09-01T08:00:00.000Z');
  });

  it('restores writing a crash kept from the store, with the date the entry began', () => {
    seedSeries();
    const canonical = seedCanonicalEntry('Old draft.', '2026-09-02T10:00:00.000Z');
    useUnfoldStore.setState((state) => ({
      journalEntries: state.journalEntries.map((entry) => ({ ...entry, createdAt: '2026-08-20T08:00:00.000Z' })),
    }));
    queueWriteLostFromStore('Old draft. Written just before the crash.', '2026-09-06T00:00:00.000Z');

    // The server's copy of the day is older than the queued write, so the
    // pull keeps the queued writing.
    applyPulledUserData({
      changes: { journal_entries: [legacyRow(canonical, 'Old draft.', '2026-09-02T10:00:00.000Z')] },
      timestamp: '2026-09-06T00:00:01.000Z',
    } as never);

    const entry = useUnfoldStore.getState().journalEntries.find((item) => item.id === canonical);
    expect(entry).toMatchObject({
      content: 'Old draft. Written just before the crash.',
      createdAt: '2026-08-20T08:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
    });
  });

  it('keeps a queued canonical repair when a crash left the store on the legacy row it folded', () => {
    seedSeries();
    // The store still holds the legacy row; the fold's repair, with an edit
    // made after it, reached only the outbox.
    applyPulledUserData({
      changes: { journal_entries: [legacyRow('journal_one', 'Phone.', '2026-09-01T09:00:00.000Z')] },
      timestamp: '2026-09-02T00:00:00.000Z',
    } as never);
    const canonical = queueWriteLostFromStore('Phone. Written after the fold.', '2026-09-06T00:00:00.000Z');

    applyPulledUserData({
      changes: { journal_entries: [legacyRow('journal_two', 'Tablet.', '2026-09-01T09:30:00.000Z')] },
      timestamp: '2026-09-06T00:00:01.000Z',
    } as never);

    const queued = queuedJournal().find((change) => change.id === canonical)!;
    expect(queued.clientUpdatedAt > '2026-09-06T00:00:00.000Z').toBe(true);
    for (const text of ['Written after the fold.', 'Tablet.']) {
      expect(queued.data.content).toContain(text);
    }
  });

  it('queues nothing new when both legacy rows of a folded day arrive again', () => {
    seedSeries();
    const canonical = seedCanonicalEntry('Shared.', '2026-09-01T09:15:00.000Z');
    const rows = [
      legacyRow('journal_one', 'Phone.', '2026-09-01T09:00:00.000Z'),
      legacyRow('journal_two', 'Tablet.', '2026-09-01T09:30:00.000Z'),
    ];
    applyPulledUserData({ changes: { journal_entries: rows }, timestamp: '2026-09-02T00:00:00.000Z' } as never);
    const first = queuedJournal();
    expect(first.map((change) => change.data.content)).toEqual(['Phone.\n\nShared.\n\nTablet.']);

    applyPulledUserData({ changes: { journal_entries: rows }, timestamp: '2026-09-03T00:00:00.000Z' } as never);

    expect(queuedJournal()).toEqual(first);
    expect(useUnfoldStore.getState().journalEntries.find((item) => item.id === canonical)?.content)
      .toBe('Phone.\n\nShared.\n\nTablet.');
  });

  it('dates a restored entry from the server copy the pull brings', () => {
    seedSeries();
    const canonical = queueWriteLostFromStore('Written just before the crash.', '2026-09-06T00:00:00.000Z');

    applyPulledUserData({
      changes: { journal_entries: [legacyRow(canonical, 'Older server copy.', '2026-09-02T00:00:00.000Z')] },
      timestamp: '2026-09-06T00:00:01.000Z',
    } as never);

    expect(useUnfoldStore.getState().journalEntries.find((item) => item.id === canonical)).toMatchObject({
      content: 'Written just before the crash.',
      createdAt: '2026-09-01T08:00:00.000Z',
    });
  });

  it('restores nothing on a pull that brings no row for the day', () => {
    seedSeries();
    const canonical = seedCanonicalEntry('Old draft.', '2026-09-02T10:00:00.000Z');
    queueWriteLostFromStore('Old draft. Written just before the crash.', '2026-09-06T00:00:00.000Z');

    applyPulledUserData({ changes: {}, timestamp: '2026-09-06T00:00:01.000Z' } as never);

    expect(useUnfoldStore.getState().journalEntries.find((item) => item.id === canonical)?.content).toBe('Old draft.');
  });

  it('does not bring back a legacy write the day already folded in, after the reader cleared the day', () => {
    seedSeries();
    applyPulledUserData({
      changes: { journal_entries: [legacyRow('journal_one', 'Phone.', '2026-09-01T09:00:00.000Z')] },
      timestamp: '2026-09-02T00:00:00.000Z',
    } as never);
    // An edit under the legacy id is still queued when a second row folds the day.
    useUnfoldStore.getState().updateJournalEntry('journal_one', 'Phone, edited.');
    applyPulledUserData({
      changes: { journal_entries: [legacyRow('journal_two', 'Tablet.', '2026-09-01T09:30:00.000Z')] },
      timestamp: '2026-09-03T00:00:00.000Z',
    } as never);
    const canonical = canonicalJournalEntryId(DEVOTIONAL, DAY);
    useUnfoldStore.getState().updateJournalEntry(canonical, '');
    const cleared = queuedJournal().find((change) => change.id === canonical)!;

    // The server's echo of the cleared day brings a row for it.
    applyPulledUserData({
      changes: { journal_entries: [{ ...legacyRow(canonical, '', cleared.clientUpdatedAt), id: canonical }] },
      timestamp: '2026-09-04T00:00:00.000Z',
    } as never);

    expect(useUnfoldStore.getState().journalEntries.find((item) => item.id === canonical)?.content).toBe('');
    expect(useUnfoldStore.getState().journalEntries.some((item) => item.id === 'journal_one')).toBe(false);
  });

  // 2026-10-09 release audit: a device's first sync gets the day the reader
  // cleared after an earlier fold, together with the legacy rows that fold
  // read. A repair would push their old text back over the cleared day.
  it('does not push old text over a day the reader cleared, when a first sync folds the legacy rows back', () => {
    const canonical = canonicalJournalEntryId(DEVOTIONAL, DAY);

    applyPulledUserData({
      changes: {
        journal_entries: [
          { ...legacyRow(canonical, '', '2026-09-05T00:00:00.000Z'), id: canonical },
          legacyRow('journal_one', 'Phone.', '2026-09-01T09:00:00.000Z'),
          legacyRow('journal_two', 'Tablet.', '2026-09-01T09:30:00.000Z'),
        ],
      },
      timestamp: '2026-09-05T00:00:01.000Z',
    } as never);

    expect(queuedJournal()).toEqual([]);
  });

  it('still pushes a fold that brings writing newer than the day\'s own row', () => {
    const canonical = canonicalJournalEntryId(DEVOTIONAL, DAY);

    applyPulledUserData({
      changes: {
        journal_entries: [
          { ...legacyRow(canonical, '', '2026-09-01T08:00:00.000Z'), id: canonical },
          legacyRow('journal_one', 'Written later on the old device.', '2026-09-05T00:00:00.000Z'),
        ],
      },
      timestamp: '2026-09-05T00:00:01.000Z',
    } as never);

    const queued = queuedJournal();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ id: canonical, deleted: false });
    expect(queued[0].data.content).toContain('Written later on the old device.');
  });

  it('deletes a write queued without its row along with its series, and does not restore it', () => {
    seedSeries();
    // Dated ahead of this phone, so the delete must be stamped past it.
    const canonical = queueWriteLostFromStore('Written just before the crash.', '2099-06-01T00:00:00.000Z');

    useUnfoldStore.getState().removeDevotional(DEVOTIONAL);
    expect(queuedJournal()).toEqual([
      expect.objectContaining({ id: canonical, deleted: true, clientUpdatedAt: '2099-06-01T00:00:00.001Z' }),
    ]);

    applyPulledUserData({
      changes: { journal_entries: [legacyRow('journal_one', 'Phone.', '2026-09-01T09:00:00.000Z')] },
      timestamp: '2026-09-06T00:00:01.000Z',
    } as never);
    expect(useUnfoldStore.getState().journalEntries.some((item) => item.id === canonical)).toBe(false);
  });

  it('does not restore a write queued without its row when the pull deletes its series', () => {
    seedSeries();
    const canonical = queueWriteLostFromStore('Written just before the crash.', '2026-09-06T00:00:00.000Z');

    applyPulledUserData({
      changes: {
        devotionals: [{ id: DEVOTIONAL, data: { id: DEVOTIONAL }, updatedAt: '2026-09-07T00:00:00.000Z', deleted: true }],
        journal_entries: [legacyRow('journal_one', 'Phone.', '2026-09-01T09:00:00.000Z')],
      },
      timestamp: '2026-09-07T00:00:01.000Z',
    } as never);

    expect(useUnfoldStore.getState().journalEntries.some((item) => item.id === canonical)).toBe(false);
  });

  it('leaves the store as it is when the queued writing is what it already holds', () => {
    seedSeries();
    const canonical = seedCanonicalEntry('Saved.', '2026-09-06T00:00:00.000Z');
    queueWriteLostFromStore('Saved.', '2026-09-06T00:00:00.000Z');
    const before = useUnfoldStore.getState().journalEntries;

    // An older server copy of the day: the pull keeps the store's row.
    applyPulledUserData({
      changes: { journal_entries: [legacyRow(canonical, 'Saved.', '2026-09-05T00:00:00.000Z')] },
      timestamp: '2026-09-06T00:00:01.000Z',
    } as never);

    expect(useUnfoldStore.getState().journalEntries).toBe(before);
  });

  it('queues no repair for a day whose series the same pull deletes', () => {
    seedCanonicalEntry('Written after the upgrade.', '2026-09-02T10:00:00.000Z');

    applyPulledUserData({
      changes: {
        devotionals: [{ id: DEVOTIONAL, data: { id: DEVOTIONAL }, updatedAt: '2026-09-05T00:00:00.000Z', deleted: true }],
        journal_entries: [legacyRow('journal_a1b2c3', 'Written on the old device.', '2026-09-01T09:00:00.000Z')],
      },
      timestamp: '2026-09-05T00:00:01.000Z',
    } as never);

    expect(queuedJournal()).toEqual([]);
  });

  it('stamps a series delete past a journal edit dated ahead of this phone, so the delete is what gets pushed', () => {
    const canonical = canonicalJournalEntryId(DEVOTIONAL, DAY);
    applyPulledUserData({
      changes: { journal_entries: [legacyRow(canonical, 'From a clock ahead.', '2099-06-01T00:00:00.000Z')] },
      timestamp: '2099-06-01T00:00:01.000Z',
    } as never);
    useUnfoldStore.getState().updateJournalEntry(canonical, 'Edited here.');

    useUnfoldStore.getState().removeDevotional(DEVOTIONAL);

    expect(queuedJournal()).toEqual([
      expect.objectContaining({ id: canonical, deleted: true, clientUpdatedAt: '2099-06-01T00:00:00.002Z' }),
    ]);
  });

  // 2026-10-09 release audit: the row is on disk, but a clock-ahead repair for
  // it reached the outbox and the store's copy of it did not.
  it('stamps a series delete past a queued repair newer than the row the store kept', () => {
    seedSeries();
    const canonical = seedCanonicalEntry('Saved before the crash.', '2026-09-06T00:00:00.000Z');
    queueWriteLostFromStore('Repaired just before the crash.', '2099-06-01T00:00:00.000Z');

    useUnfoldStore.getState().removeDevotional(DEVOTIONAL);

    expect(queuedJournal()).toEqual([
      expect.objectContaining({ id: canonical, deleted: true, clientUpdatedAt: '2099-06-01T00:00:00.001Z' }),
    ]);
  });

  it('queues no repair for a day whose series has a queued delete', () => {
    seedCanonicalEntry('Written after the upgrade.', '2026-09-02T10:00:00.000Z');
    enqueueSyncChanges([{ table: 'devotionals', id: DEVOTIONAL, clientUpdatedAt: '2026-09-05T00:00:00.000Z', data: {}, deleted: true }]);

    pullLegacyRow();

    expect(queuedJournal()).toEqual([]);
  });

  it('does not queue the day again when a legacy row with prompts and prayers arrives again', () => {
    const canonical = seedCanonicalEntry('Written after the upgrade.', '2026-09-01T08:30:00.000Z');
    useUnfoldStore.setState((state) => ({
      journalEntries: state.journalEntries.map((item) => (item.id === canonical ? { ...item, deeperQuestions: ['A?'] } : item)),
    }) as never);
    const row = legacyRow('journal_lists', 'Written on the old device.', '2026-09-02T09:00:00.000Z');
    row.data = {
      ...row.data,
      deeperQuestions: ['B?'],
      prayerRequests: [{ id: 'p1', text: 'for rest', isAnswered: false, createdAt: '2026-09-02T09:00:00.000Z' }],
    } as never;
    const pull = () => applyPulledUserData({
      changes: { journal_entries: [row] },
      timestamp: '2026-09-02T11:00:00.000Z',
    } as never);

    pull();
    expect(queuedJournal()).toHaveLength(1);
    // The push landed.
    mmkvStorage.removeItem(OUTBOX_KEY);

    pull();

    expect(queuedJournal()).toEqual([]);
  });

  it('queues nothing for a pull that brings no second entry for a day', () => {
    const canonical = seedCanonicalEntry('Written after the upgrade.', '2026-09-02T10:00:00.000Z');

    applyPulledUserData({
      changes: {
        journal_entries: [legacyRow(canonical, 'Edited on another device.', '2026-09-03T10:00:00.000Z')],
      },
      timestamp: '2026-09-03T11:00:00.000Z',
    } as never);

    expect(queuedJournal()).toEqual([]);
  });
});
