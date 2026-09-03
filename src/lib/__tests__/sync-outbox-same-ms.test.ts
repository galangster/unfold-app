/**
 * Outbox dedup keyed by table:id used a strict `>` on the millisecond
 * clientUpdatedAt, so a synchronous burst of writes to one record inside one
 * millisecond kept the FIRST snapshot and dropped the newer ones. The SOAP
 * flush (ensureEntry + one updateSoapResponse per changed field) and the
 * first pasted question answer are exactly such bursts, so what synced was
 * the pre-write snapshot. Equal timestamps now let the later write win —
 * in the live outbox and in the recovery-outbox merge.
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

import { diffSoapWrites } from '../journal-entry-state';
import { mergeRecoveryOutbox, type KVAccessor } from '../mmkv-recovery-outbox';
import { useUnfoldStore } from '../store';
import { enqueueSyncChanges, peekSyncOutbox } from '../sync-outbox';

beforeEach(() => {
  useUnfoldStore.getState().reset();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-01T12:00:00.000Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('same-millisecond writes to one record', () => {
  it('a SOAP flush inside one millisecond syncs the filled fields, not the empty entry', () => {
    const store = useUnfoldStore.getState();
    // journal.tsx flushSoapSaves: ensureEntry() → addJournalEntry, then one
    // updateSoapResponse per changed field — all in one tick.
    store.addJournalEntry({ devotionalId: 'dev-1', dayNumber: 1, content: '', journalMode: 'soap' });
    const entryId = useUnfoldStore.getState().getJournalEntry('dev-1', 1)!.id;
    const local = { scripture: 'Psalm 23:1', observation: 'The Lord provides', application: '', prayer: '' };
    for (const { field, value } of diffSoapWrites(local, undefined)) {
      store.updateSoapResponse(entryId, field, value);
    }

    expect(useUnfoldStore.getState().getJournalEntry('dev-1', 1)!.soapResponses).toEqual(local);
    const queued = peekSyncOutbox().filter((c) => c.table === 'journal_entries' && c.id === entryId);
    expect(queued).toHaveLength(1);
    expect(queued[0].data.soapResponses).toEqual(local);
  });

  it('a pasted question answer right after the entry is created is what syncs', () => {
    const store = useUnfoldStore.getState();
    store.addJournalEntry({ devotionalId: 'dev-2', dayNumber: 1, content: '', journalMode: 'freewrite' });
    const entryId = useUnfoldStore.getState().getJournalEntry('dev-2', 1)!.id;
    store.updateQuestionResponse(entryId, 'What stood out?', 'pasted answer');

    const queued = peekSyncOutbox().find((c) => c.table === 'journal_entries' && c.id === entryId)!;
    expect(queued.data.questionResponses).toEqual([{ question: 'What stood out?', response: 'pasted answer' }]);
  });

  it('enqueueSyncChanges keeps the later of two equal-timestamp changes', () => {
    const at = '2026-09-01T12:00:00.000Z';
    enqueueSyncChanges([{ table: 'notes', id: 'n1', data: { title: 'first' }, clientUpdatedAt: at, deleted: false }]);
    enqueueSyncChanges([{ table: 'notes', id: 'n1', data: { title: 'second' }, clientUpdatedAt: at, deleted: false }]);
    expect(peekSyncOutbox().filter((c) => c.id === 'n1')).toEqual([
      expect.objectContaining({ data: { title: 'second' } }),
    ]);
  });
});

describe('mergeRecoveryOutbox', () => {
  const kv = (): KVAccessor & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return {
      data,
      getString: (key) => data.get(key),
      set: (key, value) => { data.set(key, value); },
      delete: (key) => { data.delete(key); },
    };
  };

  it('the recovery-session entry (written later) wins an equal clientUpdatedAt', () => {
    const at = '2026-06-01T00:00:00.000Z';
    const real = kv();
    const recovery = kv();
    real.set('outbox', JSON.stringify([{ table: 'notes', id: 'n1', clientUpdatedAt: at, data: { title: 'before recovery' }, deleted: false }]));
    recovery.set('outbox', JSON.stringify([{ table: 'notes', id: 'n1', clientUpdatedAt: at, data: { title: 'during recovery' }, deleted: false }]));

    mergeRecoveryOutbox(real, recovery, 'outbox');

    expect(JSON.parse(real.data.get('outbox')!)).toEqual([
      expect.objectContaining({ data: { title: 'during recovery' } }),
    ]);
    expect(recovery.data.has('outbox')).toBe(false);
  });
});
