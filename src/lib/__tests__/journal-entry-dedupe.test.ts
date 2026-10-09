/**
 * One journal entry per (devotionalId, dayNumber). Ids used to be random per
 * device, so the same day written on two devices produced two rows that both
 * synced, while every lookup (getJournalEntry, the editor's existingEntry,
 * the hub's todayEntry) is a first-match `find` — the second entry was
 * invisible but kept overwriting nothing, and whichever device wrote second
 * saw its own text vanish from the hub. Ids are now derived from the day, so
 * the two devices converge on one row, and a migration merges what is
 * already on disk without dropping any text.
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

jest.mock('../sync-ids', () => ({
  newId: jest.fn(() => `test-id-${Math.random().toString(36).slice(2, 8)}`),
  compositeId: jest.fn((...parts: unknown[]) => `uuid(${parts.join(':')})`),
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
import { canonicalJournalEntryId, mergeJournalEntryDuplicates } from '../journal-entry-merge';
import { useUnfoldStore, type JournalEntry } from '../store';
import { migrateUnfoldStore } from '../store-migrations';

const DAY_ID = canonicalJournalEntryId('dev-1', 1);

function serverJournalRow(id: string, data: Record<string, unknown>) {
  return {
    id,
    data: {
      id,
      devotionalId: 'dev-1',
      dayNumber: 1,
      journalMode: 'freewrite',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      clientUpdatedAt: '2026-09-01T10:00:00.000Z',
      deletedAt: null,
      ...data,
    },
    updatedAt: '2026-09-01T10:00:00.000Z',
    deleted: false,
  };
}

beforeEach(() => {
  useUnfoldStore.getState().reset();
});

describe('one journal entry per day', () => {
  it('addJournalEntry returns a deterministic id derived from the day', () => {
    const id = useUnfoldStore.getState().addJournalEntry({
      devotionalId: 'dev-1',
      dayNumber: 1,
      content: 'first',
      journalMode: 'freewrite',
    });
    expect(id).toBe(DAY_ID);
    expect(useUnfoldStore.getState().getJournalEntry('dev-1', 1)?.id).toBe(id);
    // A different day is a different id.
    expect(canonicalJournalEntryId('dev-1', 2)).not.toBe(DAY_ID);
  });

  it('a second addJournalEntry for the same day returns the same entry instead of a duplicate', () => {
    const store = useUnfoldStore.getState();
    const first = store.addJournalEntry({ devotionalId: 'dev-1', dayNumber: 1, content: 'written text', journalMode: 'freewrite' });
    const second = store.addJournalEntry({ devotionalId: 'dev-1', dayNumber: 1, content: '', journalMode: 'soap' });

    expect(second).toBe(first);
    expect(useUnfoldStore.getState().journalEntries).toHaveLength(1);
    expect(useUnfoldStore.getState().journalEntries[0].content).toBe('written text'); // never clobbered
  });

  it('an entry pulled from another device is reused, not duplicated', () => {
    // Device B's row still carries its own (older, random) id.
    applyPulledUserData({
      changes: { journal_entries: [serverJournalRow('journal-from-device-b', { content: 'device B text' })] },
      timestamp: '2026-09-01T10:00:01.000Z',
    });

    const id = useUnfoldStore.getState().addJournalEntry({
      devotionalId: 'dev-1',
      dayNumber: 1,
      content: '',
      journalMode: 'freewrite',
    });

    expect(id).toBe('journal-from-device-b');
    expect(useUnfoldStore.getState().journalEntries).toHaveLength(1);
    expect(useUnfoldStore.getState().getJournalEntry('dev-1', 1)?.content).toBe('device B text');
  });
});

describe('mergeJournalEntryDuplicates', () => {
  const entry = (over: Partial<JournalEntry>): JournalEntry => ({
    id: 'e',
    devotionalId: 'dev-1',
    dayNumber: 1,
    content: '',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...over,
  });

  it('leaves a single entry alone apart from adopting the canonical id', () => {
    const only = entry({ id: 'legacy-random', content: 'text' });
    const merged = mergeJournalEntryDuplicates([only]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: DAY_ID, content: 'text' });
  });

  it('keeps the text of both entries, oldest first', () => {
    const merged = mergeJournalEntryDuplicates([
      entry({ id: 'b', content: 'device B text', updatedAt: '2026-09-02T10:00:00.000Z' }),
      entry({ id: 'a', content: 'device A text', updatedAt: '2026-09-01T10:00:00.000Z' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].content).toBe('device A text\n\ndevice B text');
    expect(merged[0].id).toBe(DAY_ID);
    expect(merged[0].updatedAt).toBe('2026-09-02T10:00:00.000Z');
    expect(merged[0].createdAt).toBe('2026-09-01T10:00:00.000Z');
  });

  it('does not repeat identical text, and an empty side never blanks the other', () => {
    const merged = mergeJournalEntryDuplicates([
      entry({ id: 'a', content: 'same words', updatedAt: '2026-09-01T10:00:00.000Z' }),
      entry({ id: 'b', content: 'same words', updatedAt: '2026-09-02T10:00:00.000Z' }),
      entry({ id: 'c', content: '', updatedAt: '2026-09-03T10:00:00.000Z' }),
    ]);
    expect(merged[0].content).toBe('same words');
  });

  it('merges SOAP per field, question responses per question, and unions prayers and prompts', () => {
    const merged = mergeJournalEntryDuplicates([
      entry({
        id: 'a',
        updatedAt: '2026-09-01T10:00:00.000Z',
        journalMode: 'soap',
        soapResponses: { scripture: 'Psalm 23:1', observation: 'A observed', application: '', prayer: '' },
        questionResponses: [{ question: 'Q1', response: 'A answer' }],
        prayerRequests: [{ id: 'p1', text: 'for my family', isAnswered: false, createdAt: '2026-09-01T10:00:00.000Z' }],
        deeperQuestions: ['AI-1'],
      }),
      entry({
        id: 'b',
        updatedAt: '2026-09-02T10:00:00.000Z',
        journalMode: 'soap',
        soapResponses: { scripture: '', observation: 'B observed', application: 'B applied', prayer: '' },
        questionResponses: [
          { question: 'Q1', response: 'B answer' },
          { question: 'Q2', response: 'only on B' },
        ],
        prayerRequests: [{ id: 'p2', text: 'for my work', isAnswered: true, createdAt: '2026-09-02T10:00:00.000Z' }],
        deeperQuestions: ['AI-1', 'AI-2'],
      }),
    ]);

    expect(merged[0].soapResponses).toEqual({
      scripture: 'Psalm 23:1',                    // only A had it
      observation: 'A observed\n\nB observed',    // both, nothing dropped
      application: 'B applied',
      prayer: '',
    });
    expect(merged[0].questionResponses).toEqual([
      { question: 'Q1', response: 'A answer\n\nB answer' },
      { question: 'Q2', response: 'only on B' },
    ]);
    expect(merged[0].prayerRequests?.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(merged[0].deeperQuestions).toEqual(['AI-1', 'AI-2']);
    expect(merged[0].journalMode).toBe('soap');
  });

  it('keeps entries for different days separate', () => {
    const merged = mergeJournalEntryDuplicates([
      entry({ id: 'a', dayNumber: 1, content: 'day one' }),
      entry({ id: 'b', dayNumber: 2, content: 'day two' }),
      entry({ id: 'c', devotionalId: 'dev-2', dayNumber: 1, content: 'other series' }),
    ]);
    expect(merged).toHaveLength(3);
    expect(merged.map((e) => e.content).sort()).toEqual(['day one', 'day two', 'other series']);
  });
});

describe('migration v41→42: merge duplicate journal entries', () => {
  it('collapses two entries for one day into a canonical id, keeping both texts', () => {
    const migrated = migrateUnfoldStore(
      {
        journalEntries: [
          { id: 'a', devotionalId: 'dev-1', dayNumber: 1, content: 'device A text', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' },
          { id: 'b', devotionalId: 'dev-1', dayNumber: 1, content: 'device B text', createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z' },
          { id: 'c', devotionalId: 'dev-1', dayNumber: 2, content: 'day two', createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z' },
          null,
        ],
      },
      41,
    ) as { journalEntries: JournalEntry[] };

    expect(migrated.journalEntries).toHaveLength(2);
    const dayOne = migrated.journalEntries.find((e) => e.dayNumber === 1)!;
    expect(dayOne.id).toBe(DAY_ID);
    expect(dayOne.content).toBe('device A text\n\ndevice B text');
    expect(migrated.journalEntries.find((e) => e.dayNumber === 2)?.content).toBe('day two');
  });

  it('tolerates a missing journalEntries slice', () => {
    expect(() => migrateUnfoldStore({ user: null }, 41)).not.toThrow();
  });
});
