/**
 * Tests for the recovery-outbox merge helper (RS2-1).
 *
 * Scenario: outbox entries written during an MMKV recovery session (when the
 * Keychain is down and the app runs on the throwaway 'unfold-store-v2-recovery'
 * namespace) are abandoned on the next normal launch unless explicitly merged.
 *
 * mergeRecoveryOutbox() is the pure helper that performs this merge; it is
 * called at mmkv-storage module init on every non-recovery boot.
 */

import { mergeRecoveryOutbox, RECOVERY_OUTBOX_KEY, type KVAccessor } from '../mmkv-recovery-outbox';

function makeKV(initial: Record<string, string> = {}): KVAccessor & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getString(key) { return store.get(key); },
    set(key, value) { store.set(key, value); },
    delete(key) { store.delete(key); },
  };
}

function makeEntry(id: string, table: string, ts: string) {
  return { table, id, clientUpdatedAt: ts, data: { value: id }, deleted: false };
}

describe('mergeRecoveryOutbox (RS2-1)', () => {
  it('enqueue in recovery session → normal relaunch → entry present in real outbox', () => {
    const recoveryEntry = makeEntry('d1', 'devotionals', '2026-06-01T00:00:00Z');
    const recoveryKV = makeKV({
      [RECOVERY_OUTBOX_KEY]: JSON.stringify([recoveryEntry]),
    });
    const realKV = makeKV(); // empty — no prior outbox entries

    mergeRecoveryOutbox(realKV, recoveryKV, RECOVERY_OUTBOX_KEY);

    const merged = JSON.parse(realKV.getString(RECOVERY_OUTBOX_KEY) ?? '[]');
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('d1');
    expect(merged[0].clientUpdatedAt).toBe('2026-06-01T00:00:00Z');
  });

  it('recovery entries are merged into existing real outbox (dedupe by table:id)', () => {
    const realEntry = makeEntry('d1', 'devotionals', '2026-06-01T00:00:00Z');
    const recoveryEntry = makeEntry('d2', 'devotionals', '2026-06-02T00:00:00Z');

    const realKV = makeKV({ [RECOVERY_OUTBOX_KEY]: JSON.stringify([realEntry]) });
    const recoveryKV = makeKV({ [RECOVERY_OUTBOX_KEY]: JSON.stringify([recoveryEntry]) });

    mergeRecoveryOutbox(realKV, recoveryKV, RECOVERY_OUTBOX_KEY);

    const merged = JSON.parse(realKV.getString(RECOVERY_OUTBOX_KEY) ?? '[]');
    const ids = merged.map((c: { id: string }) => c.id).sort();
    expect(ids).toEqual(['d1', 'd2']);
  });

  it('recovery entry beats real entry with same key when clientUpdatedAt is newer', () => {
    const realEntry = makeEntry('d1', 'devotionals', '2026-06-01T00:00:00Z');
    const recoveryEntry = makeEntry('d1', 'devotionals', '2026-06-02T00:00:00Z'); // newer

    const realKV = makeKV({ [RECOVERY_OUTBOX_KEY]: JSON.stringify([realEntry]) });
    const recoveryKV = makeKV({ [RECOVERY_OUTBOX_KEY]: JSON.stringify([recoveryEntry]) });

    mergeRecoveryOutbox(realKV, recoveryKV, RECOVERY_OUTBOX_KEY);

    const merged = JSON.parse(realKV.getString(RECOVERY_OUTBOX_KEY) ?? '[]');
    expect(merged).toHaveLength(1);
    expect(merged[0].clientUpdatedAt).toBe('2026-06-02T00:00:00Z');
  });

  it('real entry survives when it is newer than the recovery entry for the same key', () => {
    const realEntry = makeEntry('d1', 'devotionals', '2026-06-03T00:00:00Z'); // newer
    const recoveryEntry = makeEntry('d1', 'devotionals', '2026-06-01T00:00:00Z');

    const realKV = makeKV({ [RECOVERY_OUTBOX_KEY]: JSON.stringify([realEntry]) });
    const recoveryKV = makeKV({ [RECOVERY_OUTBOX_KEY]: JSON.stringify([recoveryEntry]) });

    mergeRecoveryOutbox(realKV, recoveryKV, RECOVERY_OUTBOX_KEY);

    const merged = JSON.parse(realKV.getString(RECOVERY_OUTBOX_KEY) ?? '[]');
    expect(merged).toHaveLength(1);
    expect(merged[0].clientUpdatedAt).toBe('2026-06-03T00:00:00Z');
  });

  it('recovery namespace key is deleted after merge (REVM-4: recovery stays empty)', () => {
    const recoveryEntry = makeEntry('d1', 'devotionals', '2026-06-01T00:00:00Z');
    const recoveryKV = makeKV({ [RECOVERY_OUTBOX_KEY]: JSON.stringify([recoveryEntry]) });
    const realKV = makeKV();

    mergeRecoveryOutbox(realKV, recoveryKV, RECOVERY_OUTBOX_KEY);

    expect(recoveryKV.getString(RECOVERY_OUTBOX_KEY)).toBeUndefined();
  });

  it('no-op when recovery outbox is empty — real outbox untouched', () => {
    const realEntry = makeEntry('d1', 'devotionals', '2026-06-01T00:00:00Z');
    const realKV = makeKV({ [RECOVERY_OUTBOX_KEY]: JSON.stringify([realEntry]) });
    const recoveryKV = makeKV(); // nothing in recovery namespace

    mergeRecoveryOutbox(realKV, recoveryKV, RECOVERY_OUTBOX_KEY);

    const real = JSON.parse(realKV.getString(RECOVERY_OUTBOX_KEY) ?? '[]');
    expect(real).toHaveLength(1);
    expect(real[0].id).toBe('d1');
  });

  it('no-op when recovery outbox JSON is an empty array — real outbox untouched', () => {
    const realEntry = makeEntry('d1', 'devotionals', '2026-06-01T00:00:00Z');
    const realKV = makeKV({ [RECOVERY_OUTBOX_KEY]: JSON.stringify([realEntry]) });
    const recoveryKV = makeKV({ [RECOVERY_OUTBOX_KEY]: '[]' });

    mergeRecoveryOutbox(realKV, recoveryKV, RECOVERY_OUTBOX_KEY);

    const real = JSON.parse(realKV.getString(RECOVERY_OUTBOX_KEY) ?? '[]');
    expect(real).toHaveLength(1);
    expect(real[0].id).toBe('d1');
  });
});
