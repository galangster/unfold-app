import {
  correlateSyncAcknowledgements,
  resolvingAcknowledgementPairs,
} from '../sync-acknowledgements';
import type { SyncPushChange } from '../sync-types';

const at = '2026-09-05T12:00:00.000Z';
const serverAt = '2026-06-01T12:00:00.000Z';

function change(id: string, table: SyncPushChange['table'] = 'notes'): SyncPushChange {
  return {
    table,
    id,
    clientUpdatedAt: at,
    deleted: false,
    data: { schemaVersion: 1, value: id },
  };
}

function result(id: string, extra: Record<string, unknown> = {}) {
  return {
    table: 'notes',
    id,
    status: 'accepted' as const,
    serverUpdatedAt: at,
    ...extra,
  };
}

function resolvedIds(submitted: SyncPushChange[], results: unknown[]) {
  return resolvingAcknowledgementPairs(submitted, results).map((pair) => pair.change.id);
}

describe('sync acknowledgement correlation', () => {
  it('does not infer matches from result count alone', () => {
    const submitted = [change('a'), change('b')];
    expect(resolvingAcknowledgementPairs(submitted, [{ status: 'accepted' }, { status: 'accepted' }])).toEqual([]);
  });

  it('acknowledges a valid ordered prefix and retains the unpaired tail', () => {
    expect(resolvedIds([change('a'), change('b')], [result('a')])).toEqual(['a']);
  });

  it('rejects a response longer than the submitted batch', () => {
    expect(resolvedIds([change('a')], [result('a'), result('ghost')])).toEqual([]);
  });

  it('rejects extra explicit claims after a malformed prefix', () => {
    expect(resolvedIds([change('a')], [null, result('a', { requestedId: 'a' })])).toEqual([]);
  });

  it('retains a change claimed by both a legacy accepted and an explicit rejected result', () => {
    expect(resolvedIds(
      [change('a'), change('b')],
      [result('a'), result('a', { requestedId: 'a', status: 'rejected', reason: 'internal error' })],
    )).toEqual([]);
  });

  it('retains a change claimed by both an explicit accepted and a legacy rejected result', () => {
    expect(resolvedIds(
      [change('b'), change('a')],
      [result('a', { requestedId: 'a' }), result('a', { status: 'rejected', reason: 'internal error' })],
    )).toEqual([]);
  });

  it('retains a when a valid explicit claim is followed by a malformed explicit duplicate', () => {
    expect(resolvedIds(
      [change('a'), change('b')],
      [
        result('a', { requestedId: 'a' }),
        { table: 'notes', requestedId: 'a', id: 'a', status: 'rejected', reason: 'internal error' },
      ],
    )).toEqual([]);
  });

  it('retains a when a malformed explicit claim is followed by a valid explicit duplicate', () => {
    expect(resolvedIds(
      [change('a'), change('b')],
      [
        { table: 'notes', requestedId: 'a', id: 'a', status: 'rejected', reason: 'internal error' },
        result('a', { requestedId: 'a' }),
      ],
    )).toEqual([]);
  });

  it('keeps a unique sibling when a malformed explicit duplicate makes a ambiguous', () => {
    expect(resolvedIds(
      [change('a'), change('b'), change('c')],
      [
        result('a', { requestedId: 'a' }),
        { table: 'notes', requestedId: 'a', id: 'a', status: 'rejected', reason: 'internal error' },
        result('c', { requestedId: 'c' }),
      ],
    )).toEqual(['c']);
  });

  it('rejects an explicit non-composite canonical mismatch', () => {
    expect(resolvedIds([change('a')], [result('other', { requestedId: 'a' })])).toEqual([]);
  });

  it('rejects an explicit non-composite remapped conflict', () => {
    expect(resolvedIds(
      [change('a')],
      [result('other', { requestedId: 'a', status: 'conflict', serverData: { id: 'other' } })],
    )).toEqual([]);
  });

  it('maps unique explicit requested IDs when results arrive out of order', () => {
    expect(resolvedIds(
      [change('a'), change('b')],
      [result('b', { requestedId: 'b' }), result('a', { requestedId: 'a' })],
    )).toEqual(['b', 'a']);
  });

  it('preserves positions after a malformed legacy prefix', () => {
    expect(resolvedIds([change('a'), change('b')], [null, result('b')])).toEqual(['b']);
  });

  it('keeps a unique explicit sibling when another requested ID is duplicated', () => {
    expect(resolvedIds(
      [change('a'), change('b'), change('c')],
      [
        result('a', { requestedId: 'a' }),
        result('a', { requestedId: 'a', status: 'rejected' }),
        result('c', { requestedId: 'c' }),
      ],
    )).toEqual(['c']);
  });

  it('does not fall back to position for an unknown requested ID', () => {
    expect(resolvedIds(
      [change('a'), change('b')],
      [result('a', { requestedId: 'unknown' }), result('b')],
    )).toEqual(['b']);
  });

  it('does not fall back to position when requestedId is present but empty', () => {
    expect(correlateSyncAcknowledgements([change('a')], [{
      table: 'notes',
      requestedId: '',
      id: 'a',
      status: 'accepted',
      serverUpdatedAt: serverAt,
    }])).toEqual([]);
    expect(resolvedIds(
      [change('a'), change('b')],
      [result('a', { requestedId: '' }), result('b')],
    )).toEqual(['b']);
  });

  it('keeps mixed unique legacy and explicit claims', () => {
    expect(resolvedIds(
      [change('a'), change('b')],
      [result('a'), result('b', { requestedId: 'b' })],
    )).toEqual(['a', 'b']);
  });

  it('correlates rejected internal errors without resolving them', () => {
    const submitted = [change('a'), change('b')];
    const results = [
      result('a', { status: 'rejected', reason: 'internal error' }),
      result('b'),
    ];
    expect(correlateSyncAcknowledgements(submitted, results)).toHaveLength(2);
    expect(resolvedIds(submitted, results)).toEqual(['b']);
  });

  it('clears a legacy composite canonical remap', () => {
    expect(resolvedIds(
      [change('a', 'bible_reading_positions')],
      [result('canonical', { table: 'bible_reading_positions' })],
    )).toEqual(['a']);
  });

  it('retains a legacy remap that names another submitted row', () => {
    expect(resolvedIds(
      [change('a', 'devotional_days'), change('b', 'devotional_days')],
      [result('b', { table: 'devotional_days' }), result('b', { table: 'devotional_days' })],
    )).toEqual(['b']);
  });

  it('allows an explicit composite remap that names another submitted row', () => {
    expect(resolvedIds(
      [change('a', 'devotional_days'), change('b', 'devotional_days')],
      [
        result('b', { table: 'devotional_days', requestedId: 'a' }),
        result('b', { table: 'devotional_days', requestedId: 'b' }),
      ],
    )).toEqual(['a', 'b']);
  });

  it('retains a conflict without an object row', () => {
    expect(resolvedIds([change('a')], [result('a', { status: 'conflict', serverData: [] })])).toEqual([]);
  });
});
