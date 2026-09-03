/**
 * Journal entries restored by a sync pull (reinstall, second device, or a
 * pull that lands mid-edit) must carry a `soapResponses` the screens can
 * read without guards: all four string fields, or no object at all.
 *
 * A NULL soap_responses column (every freewrite entry) used to map to `{}`,
 * and journal.tsx / journal-detail.tsx then threw `.trim` on undefined into
 * the root error boundary on every synced reflection.
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
  compositeId: jest.fn((...parts: unknown[]) => parts.join(':')),
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
import {
  EMPTY_SOAP_RESPONSES,
  normalizeSoapResponses,
  SOAP_FIELDS,
} from '../journal-entry-state';
import { useUnfoldStore } from '../store';
import { migrateUnfoldStore } from '../store-migrations';

const PULL_TIMESTAMP = '2026-09-01T10:00:01.000Z';
const FULL_SOAP = {
  scripture: 'Psalm 23:1',
  observation: 'The Lord provides',
  application: 'Rest today',
  prayer: 'Thank you',
};

/** A journal row exactly as /api/sync/pull returns it (raw DB row as `data`). */
function serverJournalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'journal-remote-1',
    data: {
      id: 'journal-remote-1',
      clerkUserId: 'user-1',
      devotionalId: 'dev-1',
      dayNumber: 1,
      content: 'Restored freewrite text from the server',
      journalMode: 'freewrite',
      soapResponses: null,
      questionResponses: null,
      prayerRequests: null,
      deeperQuestions: null,
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      clientUpdatedAt: '2026-09-01T10:00:00.000Z',
      deletedAt: null,
      ...overrides,
    },
    updatedAt: '2026-09-01T10:00:00.000Z',
    deleted: false,
  };
}

beforeEach(() => {
  useUnfoldStore.getState().reset();
});

describe('sync pull: journal soapResponses shape', () => {
  it('maps a NULL soap_responses column to no soapResponses at all', () => {
    applyPulledUserData({
      changes: { journal_entries: [serverJournalRow()] },
      timestamp: PULL_TIMESTAMP,
    });
    const entry = useUnfoldStore.getState().journalEntries[0];
    expect(entry).toBeTruthy();
    expect(entry.soapResponses).toBeUndefined();

    // The exact expressions journal.tsx (soapCompletedCount) and
    // journal-detail.tsx (hasSoapContent) evaluate on a restored entry.
    const soapValues = entry.soapResponses ?? EMPTY_SOAP_RESPONSES;
    expect(() => SOAP_FIELDS.filter((key) => soapValues[key].trim().length > 0)).not.toThrow();
    expect(
      () =>
        entry.soapResponses &&
        (entry.soapResponses.scripture.trim() ||
          entry.soapResponses.observation.trim() ||
          entry.soapResponses.application.trim() ||
          entry.soapResponses.prayer.trim()),
    ).not.toThrow();
  });

  it('fills a partial SOAP object from the server out to all four fields', () => {
    applyPulledUserData({
      changes: {
        journal_entries: [
          serverJournalRow({ journalMode: 'soap', soapResponses: { scripture: 'Psalm 23:1' } }),
        ],
      },
      timestamp: PULL_TIMESTAMP,
    });
    expect(useUnfoldStore.getState().journalEntries[0].soapResponses).toEqual({
      scripture: 'Psalm 23:1',
      observation: '',
      application: '',
      prayer: '',
    });
  });

  it('keeps a complete SOAP object as-is', () => {
    applyPulledUserData({
      changes: { journal_entries: [serverJournalRow({ journalMode: 'soap', soapResponses: FULL_SOAP })] },
      timestamp: PULL_TIMESTAMP,
    });
    expect(useUnfoldStore.getState().journalEntries[0].soapResponses).toEqual(FULL_SOAP);
  });
});

describe('normalizeSoapResponses', () => {
  it('returns undefined for anything that carries no SOAP text fields', () => {
    expect(normalizeSoapResponses(undefined)).toBeUndefined();
    expect(normalizeSoapResponses(null)).toBeUndefined();
    expect(normalizeSoapResponses({})).toBeUndefined();
    expect(normalizeSoapResponses([])).toBeUndefined();
    expect(normalizeSoapResponses('scripture')).toBeUndefined();
    expect(normalizeSoapResponses({ scripture: 1, prayer: null })).toBeUndefined();
  });

  it('returns exactly the four string fields, dropping anything else', () => {
    expect(normalizeSoapResponses({ scripture: 'a', extra: 'x', prayer: 7 })).toEqual({
      scripture: 'a',
      observation: '',
      application: '',
      prayer: '',
    });
    expect(normalizeSoapResponses(FULL_SOAP)).toEqual(FULL_SOAP);
  });
});

describe('migration v40→41: repair persisted journal soapResponses', () => {
  it('drops an empty object, fills a partial one, and leaves the rest alone', () => {
    const migrated = migrateUnfoldStore(
      {
        journalEntries: [
          { id: 'empty', devotionalId: 'd', dayNumber: 1, content: 'x', soapResponses: {} },
          { id: 'partial', devotionalId: 'd', dayNumber: 2, content: '', soapResponses: { observation: 'o' } },
          { id: 'full', devotionalId: 'd', dayNumber: 3, content: '', soapResponses: FULL_SOAP },
          { id: 'absent', devotionalId: 'd', dayNumber: 4, content: 'y' },
          null,
        ],
      },
      40,
    ) as { journalEntries: Array<Record<string, unknown> | null> };

    // v42 (same chain) re-keys entries by day, so look them up that way.
    const byDay = new Map(
      migrated.journalEntries.filter(Boolean).map((entry) => [entry!.dayNumber as number, entry!]),
    );
    expect(byDay.get(1)!.soapResponses).toBeUndefined();
    expect(byDay.get(2)!.soapResponses).toEqual({
      scripture: '',
      observation: 'o',
      application: '',
      prayer: '',
    });
    expect(byDay.get(3)!.soapResponses).toEqual(FULL_SOAP);
    expect(byDay.get(4)!.soapResponses).toBeUndefined();
    expect(byDay.get(4)!.content).toBe('y');
  });

  it('tolerates a missing journalEntries slice', () => {
    expect(() => migrateUnfoldStore({ user: null }, 40)).not.toThrow();
  });
});
