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
import { useUnfoldStore } from '../store';

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
