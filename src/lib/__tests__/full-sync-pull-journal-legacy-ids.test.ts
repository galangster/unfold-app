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
