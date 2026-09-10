import {
  assembleSyncPushBody,
  createSyncPushBodyEnvelope,
  encodedSyncPushBodyBytes,
  selectEncodedSyncPushBatch,
  serializeSyncPushChange,
} from '../sync-push-body';
import type { EncodedSyncPushBatch } from '../sync-push-body';
import type { SyncPushChange } from '../sync-types';

function change(id: string, extra: Partial<SyncPushChange> = {}): SyncPushChange {
  return {
    table: 'notes',
    id,
    clientUpdatedAt: '2026-06-01T00:00:00.000Z',
    deleted: false,
    data: { schemaVersion: 1, value: id },
    ...extra,
  };
}

function includeAll(): boolean {
  return true;
}

function isSyncChange(value: unknown): value is SyncPushChange {
  return !!value
    && typeof value === 'object'
    && 'table' in value
    && 'id' in value
    && 'data' in value;
}

function measureSelectorWork(run: () => EncodedSyncPushBatch) {
  const stringify = jest.spyOn(JSON, 'stringify');
  try {
    const selected = run();
    let changeEncodeCalls = 0;
    let changeEncodedBytes = 0;
    stringify.mock.calls.forEach((args, index) => {
      if (!isSyncChange(args[0])) return;
      const result = stringify.mock.results[index];
      if (result.type !== 'return' || typeof result.value !== 'string') return;
      changeEncodeCalls += 1;
      changeEncodedBytes += Buffer.byteLength(result.value, 'utf8');
    });
    return { selected, changeEncodeCalls, changeEncodedBytes };
  } finally {
    stringify.mockRestore();
  }
}

describe('sync push body encoding', () => {
  it('counts ASCII, non-ASCII, emoji, escapes, and timezone with Buffer.byteLength', () => {
    const envelope = createSyncPushBodyEnvelope('America/Los_Angeles');
    const samples: SyncPushChange[] = [
      change('ascii', { data: { text: 'plain-ascii' } }),
      change('non-ascii', { data: { text: 'café 你' } }),
      change('emoji', { data: { text: '😀👨‍👩‍👧‍👦' } }),
      change('escapes', { data: { text: 'say "hi"\\\n\u0001' } }),
    ];

    const encoded = samples.map((sample) => serializeSyncPushChange(sample));
    for (const item of encoded) {
      expect(item.bytes).toBe(Buffer.byteLength(item.json, 'utf8'));
    }

    const body = assembleSyncPushBody(envelope, encoded.map((item) => item.json));
    const itemBytes = encoded.reduce((sum, item) => sum + item.bytes, 0);
    expect(Buffer.byteLength(body, 'utf8')).toBe(
      encodedSyncPushBodyBytes(envelope, itemBytes, encoded.length),
    );
    expect(JSON.parse(body).deviceTimezone).toBe('America/Los_Angeles');
    expect(Buffer.byteLength(body, 'utf8')).toBe(Buffer.byteLength(
      JSON.stringify({
        changes: samples,
        deviceTimezone: 'America/Los_Angeles',
      }),
      'utf8',
    ));
  });

  it('omits timezone from the bound envelope when the runtime has none', () => {
    const envelope = createSyncPushBodyEnvelope(null);
    const encoded = serializeSyncPushChange(change('a'));
    const body = assembleSyncPushBody(envelope, [encoded.json]);
    expect(JSON.parse(body).deviceTimezone).toBeUndefined();
    expect(Buffer.byteLength(body, 'utf8')).toBe(envelope.emptyBytes + encoded.bytes);
  });

  it('selects 500 records with linear serialize work', () => {
    const items = Array.from({ length: 500 }, (_, i) => (
      change(`n-${i}`, { data: { text: 'x'.repeat(10_000) } })
    ));
    const envelope = createSyncPushBodyEnvelope('America/Los_Angeles');
    const { selected, changeEncodeCalls, changeEncodedBytes } = measureSelectorWork(() => (
      selectEncodedSyncPushBatch(items, 0, includeAll, envelope, 500, 5 * 1024 * 1024)
    ));

    expect(selected.batch).toHaveLength(500);
    expect(changeEncodeCalls).toBe(500);
    const expectedItemBytes = items.reduce((sum, item) => (
      sum + Buffer.byteLength(JSON.stringify(item), 'utf8')
    ), 0);
    expect(changeEncodedBytes).toBe(expectedItemBytes);
    expect(changeEncodedBytes).toBeLessThan(5_200_000);
    expect(Buffer.byteLength(selected.body, 'utf8')).toBe(
      encodedSyncPushBodyBytes(envelope, changeEncodedBytes, 500),
    );
    expect(Buffer.byteLength(selected.body, 'utf8')).toBe(
      Buffer.byteLength(JSON.stringify({
        changes: items,
        deviceTimezone: 'America/Los_Angeles',
      }), 'utf8'),
    );
  });

  it('serializes an oversized candidate once and still admits a sibling', () => {
    const oversized = change('huge', { data: { pad: 'x'.repeat(5_300_000) } });
    const sibling = change('small');
    const envelope = createSyncPushBodyEnvelope('UTC');
    const { selected, changeEncodeCalls, changeEncodedBytes } = measureSelectorWork(() => (
      selectEncodedSyncPushBatch(
        [oversized, sibling],
        0,
        includeAll,
        envelope,
        500,
        5 * 1024 * 1024,
      )
    ));

    expect(selected.batch.map((item) => item.id)).toEqual(['small']);
    expect(changeEncodeCalls).toBe(2);
    expect(changeEncodedBytes).toBe(
      Buffer.byteLength(JSON.stringify(oversized), 'utf8')
      + Buffer.byteLength(JSON.stringify(sibling), 'utf8'),
    );
    expect(Buffer.byteLength(selected.body, 'utf8')).toBe(
      encodedSyncPushBodyBytes(
        envelope,
        Buffer.byteLength(JSON.stringify(sibling), 'utf8'),
        1,
      ),
    );
  });
});
