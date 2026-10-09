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
import { canonicalJournalEntryId, mergeJournalEntryDuplicates, onlyFillsEmptyFields, rebaseJournalDraft } from '../journal-entry-merge';
import { mmkvStorage } from '../mmkv-storage';
import { useUnfoldStore, type JournalEntry } from '../store';
import { migrateUnfoldStore } from '../store-migrations';
import { OUTBOX_KEY } from '../sync-outbox';

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
  // A real reset clears the store and the outbox together.
  useUnfoldStore.getState().reset();
  mmkvStorage.removeItem(OUTBOX_KEY);
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

  it('does not repeat SOAP answers or question responses when folded rows arrive again', () => {
    const soap = (scripture: string) => ({ scripture, observation: '', application: '', prayer: '' });
    const merged = mergeJournalEntryDuplicates([
      entry({
        id: DAY_ID,
        soapResponses: soap('A\n\nC\n\nB'),
        questionResponses: [{ question: 'Q', response: 'A\n\nC\n\nB' }],
        updatedAt: '2026-09-04T10:00:00.000Z',
      }),
      entry({ id: 'legacy-a', soapResponses: soap('A'), questionResponses: [{ question: 'Q', response: 'A' }], updatedAt: '2026-09-01T10:00:00.000Z' }),
      entry({ id: 'legacy-b', soapResponses: soap('B'), questionResponses: [{ question: 'Q', response: 'B' }], updatedAt: '2026-09-03T10:00:00.000Z' }),
    ]);
    expect(merged[0].soapResponses?.scripture).toBe('A\n\nC\n\nB');
    expect(merged[0].questionResponses).toEqual([{ question: 'Q', response: 'A\n\nC\n\nB' }]);
  });

  it('keeps the newest mode and prayer answer from a row whose text the day already holds', () => {
    const prayer = (isAnswered: boolean) => ({ id: 'p', text: 'Healing', isAnswered, createdAt: '2026-09-01T10:00:00.000Z' });
    const merged = mergeJournalEntryDuplicates([
      entry({ id: DAY_ID, content: 'S', journalMode: 'soap', prayerRequests: [prayer(true)], updatedAt: '2026-09-01T10:00:00.000Z' }),
      entry({ id: 'legacy-a', content: 'F', journalMode: 'freewrite', prayerRequests: [prayer(false)], updatedAt: '2026-09-02T10:00:00.000Z' }),
      entry({ id: 'legacy-b', content: 'S', journalMode: 'soap', prayerRequests: [prayer(true)], updatedAt: '2026-09-03T10:00:00.000Z' }),
    ]);
    expect(merged[0].content).toBe('S\n\nF');
    expect(merged[0].journalMode).toBe('soap');
    expect(merged[0].prayerRequests?.[0].isAnswered).toBe(true);
  });

  // 2026-10-09 release audit: a device marked the prayer answered, then a text
  // repair from another device, holding its older unanswered copy, folded the
  // day later.
  it('keeps a prayer answered when a later repair carries its unanswered copy', () => {
    const prayer = (isAnswered: boolean) => ({
      id: 'p', text: 'Healing', isAnswered, createdAt: '2026-09-01T10:00:00.000Z',
      ...(isAnswered ? { answeredAt: '2026-09-02T10:05:00.000Z' } : {}),
    });
    const merged = mergeJournalEntryDuplicates([
      entry({ id: 'legacy-a', content: 'Old device.', prayerRequests: [prayer(true)], updatedAt: '2026-09-02T10:05:00.000Z' }),
      entry({ id: DAY_ID, content: 'Old device.\n\nRepair.', prayerRequests: [prayer(false)], updatedAt: '2026-09-02T10:10:00.000Z' }),
    ]);

    expect(merged[0].prayerRequests).toEqual([
      expect.objectContaining({ id: 'p', isAnswered: true, answeredAt: '2026-09-02T10:05:00.000Z' }),
    ]);
  });

  it('lets a later "not answered" stand over an older answered copy', () => {
    const answered = { id: 'p', text: 'Healing', isAnswered: true, answeredAt: '2026-09-02T10:05:00.000Z', createdAt: '2026-09-01T10:00:00.000Z' };
    const cleared = { id: 'p', text: 'Healing', isAnswered: false, answerChangedAt: '2026-09-02T11:00:00.000Z', createdAt: '2026-09-01T10:00:00.000Z' };
    const merged = mergeJournalEntryDuplicates([
      entry({ id: 'legacy-a', content: 'Old device.', prayerRequests: [answered], updatedAt: '2026-09-02T10:05:00.000Z' }),
      entry({ id: DAY_ID, content: 'Old device.', prayerRequests: [cleared], updatedAt: '2026-09-02T11:00:00.000Z' }),
    ]);

    expect(merged[0].prayerRequests).toEqual([cleared]);
  });

  it('keeps a later "not answered" when a newer repair carries a stale answered copy', () => {
    const cleared = { id: 'p', text: 'Healing', isAnswered: false, answerChangedAt: '2026-09-03T10:00:00.000Z', createdAt: '2026-09-01T10:00:00.000Z' };
    const stale = { id: 'p', text: 'Healing', isAnswered: true, answeredAt: '2026-09-02T10:00:00.000Z', createdAt: '2026-09-01T10:00:00.000Z' };
    const merged = mergeJournalEntryDuplicates([
      entry({ id: DAY_ID, content: 'Day.', prayerRequests: [cleared], updatedAt: '2026-09-03T10:00:00.000Z' }),
      entry({ id: 'legacy-a', content: 'Day.\n\nRepair.', prayerRequests: [stale], updatedAt: '2026-09-03T11:00:00.000Z' }),
    ]);

    expect(merged[0].prayerRequests).toEqual([
      expect.objectContaining({ id: 'p', isAnswered: false, answeredAt: undefined, answerChangedAt: '2026-09-03T10:00:00.000Z' }),
    ]);
  });

  it('keeps the later prayer decision time when both copies agree on the answer', () => {
    const prayer = (isAnswered: boolean, over: { answeredAt?: string; answerChangedAt?: string }) => ({
      id: 'p', text: 'Healing', createdAt: '2026-09-01T10:00:00.000Z', isAnswered, ...over,
    });
    const merged = mergeJournalEntryDuplicates([
      entry({ id: 'legacy-a', content: 'Day.', prayerRequests: [prayer(true, { answeredAt: '2026-09-02T10:05:00.000Z', answerChangedAt: '2026-09-02T10:05:00.000Z' })], updatedAt: '2026-09-02T10:05:00.000Z' }),
      entry({ id: 'legacy-b', content: 'Day.', prayerRequests: [prayer(true, { answeredAt: '2026-09-02T09:00:00.000Z' })], updatedAt: '2026-09-02T10:10:00.000Z' }),
      entry({ id: DAY_ID, content: 'Day.', prayerRequests: [prayer(false, { answerChangedAt: '2026-09-02T09:30:00.000Z' })], updatedAt: '2026-09-02T10:20:00.000Z' }),
    ]);

    expect(merged[0].prayerRequests).toEqual([
      expect.objectContaining({ isAnswered: true, answerChangedAt: '2026-09-02T10:05:00.000Z' }),
    ]);
  });

  it('keeps every prayer under its own id when two older prayers share their text', () => {
    const prayer = (id: string, text: string, isAnswered = false) => ({ id, text, isAnswered, createdAt: '2026-09-01T10:00:00.000Z' });
    const merged = mergeJournalEntryDuplicates([
      entry({ id: 'a', prayerRequests: [prayer('p1', 'Healing'), prayer('p2', 'Healing'), prayer('p3', 'Work')], updatedAt: '2026-09-01T10:00:00.000Z' }),
      entry({ id: 'b', prayerRequests: [prayer('q1', 'Healing', true)], updatedAt: '2026-09-02T10:00:00.000Z' }),
    ]);
    const prayers = merged[0].prayerRequests ?? [];
    expect(prayers.map((item) => item.id)).toEqual(['q1', 'p2', 'p3']);
    expect(prayers[0].isAnswered).toBe(true);
  });

  it('keeps an older prayer when the newer list holds only one of two with its text', () => {
    const prayer = (id: string, text: string) => ({ id, text, isAnswered: false, createdAt: '2026-09-01T10:00:00.000Z' });
    const merged = mergeJournalEntryDuplicates([
      entry({ id: 'a', prayerRequests: [prayer('p1', 'Healing'), prayer('p2', 'Healing')], updatedAt: '2026-09-01T10:00:00.000Z' }),
      entry({ id: 'b', prayerRequests: [prayer('q1', 'Healing')], updatedAt: '2026-09-02T10:00:00.000Z' }),
    ]);
    expect((merged[0].prayerRequests ?? []).map((item) => item.id)).toEqual(['q1', 'p2']);
  });

  it('does not repeat text when rows the day already folded in arrive together again', () => {
    // The day's entry holds A, C and B in clock order; A and B are its legacy rows.
    const merged = mergeJournalEntryDuplicates([
      entry({ id: DAY_ID, content: 'A\n\nC\n\nB', updatedAt: '2026-09-04T10:00:00.000Z' }),
      entry({ id: 'legacy-a', content: 'A', updatedAt: '2026-09-01T10:00:00.000Z', createdAt: '2026-08-20T10:00:00.000Z' }),
      entry({ id: 'legacy-b', content: 'B', updatedAt: '2026-09-05T10:00:00.000Z' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].content).toBe('A\n\nC\n\nB');
    // The rows left out still date the day, as a fold would.
    expect(merged[0].createdAt).toBe('2026-08-20T10:00:00.000Z');
    expect(merged[0].updatedAt).toBe('2026-09-05T10:00:00.000Z');
  });

  it("still folds a legacy row the day's entry does not hold, oldest first", () => {
    const merged = mergeJournalEntryDuplicates([
      entry({ id: DAY_ID, content: 'C', updatedAt: '2026-09-02T10:00:00.000Z' }),
      entry({ id: 'legacy-a', content: 'A', updatedAt: '2026-09-01T10:00:00.000Z', createdAt: '2026-08-30T10:00:00.000Z' }),
      entry({ id: 'legacy-b', content: 'B', updatedAt: '2026-09-03T10:00:00.000Z' }),
    ]);
    expect(merged[0].content).toBe('A\n\nC\n\nB');
    expect(merged[0].createdAt).toBe('2026-08-30T10:00:00.000Z');
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

  it("keeps the newer entry's answer on a prayer both entries hold", () => {
    const merged = mergeJournalEntryDuplicates([
      entry({
        id: 'a',
        updatedAt: '2026-09-01T10:00:00.000Z',
        prayerRequests: [
          { id: 'p1', text: 'for my family', isAnswered: false, createdAt: '2026-09-01T10:00:00.000Z' },
          { id: 'p3', text: 'only on A', isAnswered: false, createdAt: '2026-09-01T10:00:00.000Z' },
        ],
      }),
      entry({
        id: 'b',
        updatedAt: '2026-09-02T10:00:00.000Z',
        prayerRequests: [
          { id: 'p1', text: 'for my family', isAnswered: true, answeredAt: '2026-09-02T09:00:00.000Z', createdAt: '2026-09-01T10:00:00.000Z' },
        ],
      }),
    ]);

    expect(merged[0].prayerRequests).toEqual([
      expect.objectContaining({ id: 'p1', isAnswered: true, answeredAt: '2026-09-02T09:00:00.000Z' }),
      expect.objectContaining({ id: 'p3', isAnswered: false }),
    ]);
  });

  it('keeps the newer list in its own order when it already holds every older value', () => {
    const merged = mergeJournalEntryDuplicates([
      entry({ id: 'a', updatedAt: '2026-09-01T10:00:00.000Z', deeperQuestions: ['B?'] }),
      entry({ id: 'b', updatedAt: '2026-09-02T10:00:00.000Z', deeperQuestions: ['A?', 'B?'] }),
    ]);

    expect(merged[0].deeperQuestions).toEqual(['A?', 'B?']);
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

describe('prayer answers', () => {
  it('stamps both marking a prayer answered and clearing it', () => {
    const store = useUnfoldStore.getState();
    const id = store.addJournalEntry({ devotionalId: 'dev-1', dayNumber: 1, content: 'text', journalMode: 'freewrite' });
    store.addPrayerRequest(id, 'Healing');
    const prayerId = useUnfoldStore.getState().getJournalEntry('dev-1', 1)!.prayerRequests![0].id;

    useUnfoldStore.getState().togglePrayerAnswered(id, prayerId);
    const answered = useUnfoldStore.getState().getJournalEntry('dev-1', 1)!.prayerRequests![0];
    expect(answered.isAnswered).toBe(true);
    expect(answered.answerChangedAt).toBe(answered.answeredAt);

    useUnfoldStore.getState().togglePrayerAnswered(id, prayerId);
    const cleared = useUnfoldStore.getState().getJournalEntry('dev-1', 1)!.prayerRequests![0];
    expect(cleared.isAnswered).toBe(false);
    expect(cleared.answeredAt).toBeUndefined();
    expect(cleared.answerChangedAt).toEqual(expect.any(String));
  });

  it('stamps a toggle past a decision time this phone\'s clock is behind', () => {
    const store = useUnfoldStore.getState();
    const id = store.addJournalEntry({ devotionalId: 'dev-1', dayNumber: 1, content: 'text', journalMode: 'freewrite' });
    store.addPrayerRequest(id, 'Healing');
    const ahead = '2099-01-01T00:00:00.000Z';
    useUnfoldStore.setState((state) => ({
      journalEntries: state.journalEntries.map((e) => (e.id === id
        ? { ...e, prayerRequests: e.prayerRequests!.map((p) => ({ ...p, isAnswered: true, answeredAt: ahead, answerChangedAt: ahead })) }
        : e)),
    }));
    const prayerId = useUnfoldStore.getState().getJournalEntry('dev-1', 1)!.prayerRequests![0].id;

    useUnfoldStore.getState().togglePrayerAnswered(id, prayerId);

    const cleared = useUnfoldStore.getState().getJournalEntry('dev-1', 1)!.prayerRequests![0];
    expect(cleared.isAnswered).toBe(false);
    expect(cleared.answerChangedAt! > ahead).toBe(true);
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

describe('rebaseJournalDraft', () => {
  it('keeps the draft when the merge left the text alone', () => {
    expect(rebaseJournalDraft('Mine.', 'Mine.', 'Mine, edited.')).toBe('Mine, edited.');
  });

  it('takes the merged text for a field with no edits', () => {
    expect(rebaseJournalDraft('Mine.', 'Mine.\n\nTheirs.', 'Mine.')).toBe('Mine.\n\nTheirs.');
  });

  it('takes the merged text when it already holds the draft, without repeating words', () => {
    expect(rebaseJournalDraft('Hope', 'Hope grows daily', 'Hope grows')).toBe('Hope grows daily');
  });

  it('takes the merged text when a draft started on an empty field is already in it', () => {
    expect(rebaseJournalDraft('', 'My prayer, continued', 'My prayer')).toBe('My prayer, continued');
  });

  it('does not repeat an edit both devices made the same way', () => {
    expect(rebaseJournalDraft('Old.', 'New.\n\nTablet note.', 'New.')).toBe('New.\n\nTablet note.');
  });

  it('keeps a replacement that only appears inside another word of the merge', () => {
    expect(rebaseJournalDraft('I am anxious.', 'I feel peaceful today.', 'peace')).toBe('I feel peaceful today.\n\npeace');
  });

  it('takes the merged text when it holds a draft that ends on a space', () => {
    expect(rebaseJournalDraft('My', 'My prayer continued', 'My prayer ')).toBe('My prayer continued');
  });

  it('reads accents and characters outside the basic plane as parts of words', () => {
    expect(rebaseJournalDraft('Old.', 'cafe\u0301s', 'cafe\u0301')).toBe('cafe\u0301s\n\ncafe\u0301');
    expect(rebaseJournalDraft('Old.', 'a\u{20BB7}b', '\u{20BB7}')).toBe('a\u{20BB7}b\n\n\u{20BB7}');
    expect(rebaseJournalDraft('Old.', 'New cafe\u0301.\n\nTablet note.', 'New cafe\u0301.')).toBe('New cafe\u0301.\n\nTablet note.');
  });

  it('reads an emoji as a word boundary, its variation selector included', () => {
    expect(rebaseJournalDraft('Love', 'Love \u2764\uFE0FJesus', 'Love \u2764\uFE0F')).toBe('Love \u2764\uFE0FJesus');
  });

  it('keeps a draft the merge only holds cut inside an accented letter', () => {
    expect(rebaseJournalDraft('Old.', 'cafe\u0301', 'cafe')).toBe('cafe\u0301\n\ncafe');
  });

  it('keeps a first draft that only appears inside another word of the merge', () => {
    expect(rebaseJournalDraft('', 'banana', 'a')).toBe('banana\n\na');
  });

  it('still appends a draft the merge does not hold when the base is gone', () => {
    expect(rebaseJournalDraft('Old.', 'Theirs.', 'Mine.')).toBe('Theirs.\n\nMine.');
  });

  it('still keeps a deletion when the merge added words after it', () => {
    expect(rebaseJournalDraft('Hope is', 'Hope is here today', 'Hope')).toBe('Hope here today');
  });

  it('puts the edits where the base sat inside the merged text', () => {
    expect(rebaseJournalDraft('Mine.', 'Theirs.\n\nMine.', 'Mine, edited.')).toBe('Theirs.\n\nMine, edited.');
    expect(rebaseJournalDraft('Mine.', 'Mine.\n\nTheirs.', 'Mine, edited.')).toBe('Mine, edited.\n\nTheirs.');
  });

  it('keeps a draft that reads like a replacement pattern as written', () => {
    expect(rebaseJournalDraft('Mine.', 'Mine.\n\nTheirs.', 'Cost $& more')).toBe('Cost $& more\n\nTheirs.');
  });

  it('follows the merged text with the draft when the base is not in it', () => {
    expect(rebaseJournalDraft('', 'Theirs.', 'Mine.')).toBe('Theirs.\n\nMine.');
    expect(rebaseJournalDraft('Old.', 'Theirs.', 'Mine.')).toBe('Theirs.\n\nMine.');
    expect(rebaseJournalDraft('Old.', 'Theirs.', '')).toBe('Theirs.');
  });
});
