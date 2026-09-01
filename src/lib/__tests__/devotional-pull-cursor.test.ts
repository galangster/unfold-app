import {
  DEVOTIONAL_FULL_PULL_INTERVAL_MS,
  DEVOTIONAL_PULL_CURSOR_OVERLAP_MS,
  DEVOTIONAL_PULL_CURSOR_SCHEMA,
  buildNextDevotionalPullCursor,
  isValidTimestamp,
  parseDevotionalPullCursor,
  resolvePullCursor,
  serializeDevotionalPullCursor,
} from '@/lib/devotional-pull-cursor';
import type {
  CommittedDevotionalPull,
  DevotionalPullCursor,
  DevotionalPullScope,
} from '@/lib/devotional-pull-cursor';

const HOUR_MS = 60 * 60 * 1000;

const scope: DevotionalPullScope = {
  deviceId: 'device-a',
  devotionalId: 'devotional-1',
  versionMarker: 'app:1.2.3+45|store:v40|cursor:v1',
};

/** Device clock at the last full pull, and the server timestamp it returned. */
const FULL_PULL_AT = Date.parse('2026-04-25T12:00:00.000Z');
const SERVER_TS = '2026-04-25T12:00:01.000Z';

function cursor(overrides: Partial<DevotionalPullCursor> = {}): DevotionalPullCursor {
  return {
    v: DEVOTIONAL_PULL_CURSOR_SCHEMA,
    ...scope,
    lastPulledAt: SERVER_TS,
    lastFullPullAt: FULL_PULL_AT,
    ...overrides,
  };
}

function committed(overrides: Partial<CommittedDevotionalPull> = {}): CommittedDevotionalPull {
  return {
    scope,
    mode: 'incremental',
    timestamp: '2026-04-25T13:00:00.000Z',
    startedAt: FULL_PULL_AT + HOUR_MS,
    ...overrides,
  };
}

describe('resolvePullCursor', () => {
  const oneHourLater = FULL_PULL_AT + HOUR_MS;

  it('requests a full pull when nothing is stored (first launch after upgrade)', () => {
    expect(resolvePullCursor({ cursor: null, scope, now: oneHourLater })).toEqual({
      lastPulledAt: null,
      mode: 'full',
      reason: 'no-cursor',
    });
  });

  it('sends the stored server timestamp minus the overlap window for a fresh cursor', () => {
    const decision = resolvePullCursor({ cursor: cursor(), scope, now: oneHourLater });

    expect(decision.mode).toBe('incremental');
    expect(decision.reason).toBe('incremental');
    expect(decision.lastPulledAt).toBe(
      new Date(Date.parse(SERVER_TS) - DEVOTIONAL_PULL_CURSOR_OVERLAP_MS).toISOString(),
    );
    // The value sent is the server's clock, never the device's.
    expect(decision.lastPulledAt).not.toBe(new Date(oneHourLater).toISOString());
  });

  it('sends the raw server timestamp when the overlap window is zero', () => {
    expect(resolvePullCursor({ cursor: cursor(), scope, now: oneHourLater, overlapMs: 0 }).lastPulledAt)
      .toBe(SERVER_TS);
  });

  it('treats a negative overlap as zero', () => {
    expect(resolvePullCursor({ cursor: cursor(), scope, now: oneHourLater, overlapMs: -5000 }).lastPulledAt)
      .toBe(SERVER_TS);
  });

  it('never produces a negative epoch when the overlap exceeds the cursor', () => {
    const decision = resolvePullCursor({
      cursor: cursor({ lastPulledAt: '1970-01-01T00:00:30.000Z' }),
      scope,
      now: oneHourLater,
    });
    expect(decision.lastPulledAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('forces a full pull when asked, even with a fresh cursor', () => {
    expect(resolvePullCursor({ cursor: cursor(), scope, now: oneHourLater, forceFull: true })).toEqual({
      lastPulledAt: null,
      mode: 'full',
      reason: 'forced',
    });
  });

  it('forces a full pull when the devotional has no local content to apply a delta onto', () => {
    expect(resolvePullCursor({ cursor: cursor(), scope, now: oneHourLater, hasLocalContent: false })).toEqual({
      lastPulledAt: null,
      mode: 'full',
      reason: 'no-local-content',
    });
  });

  it('reconciles with a full pull once the last full pull is a day old (inclusive boundary)', () => {
    const atBoundary = FULL_PULL_AT + DEVOTIONAL_FULL_PULL_INTERVAL_MS;

    expect(resolvePullCursor({ cursor: cursor(), scope, now: atBoundary - 1 }).mode).toBe('incremental');
    expect(resolvePullCursor({ cursor: cursor(), scope, now: atBoundary })).toEqual({
      lastPulledAt: null,
      mode: 'full',
      reason: 'reconcile-interval',
    });
    expect(resolvePullCursor({ cursor: cursor(), scope, now: atBoundary + 3 * HOUR_MS }).reason)
      .toBe('reconcile-interval');
  });

  it('honours a custom reconcile interval', () => {
    expect(resolvePullCursor({ cursor: cursor(), scope, now: FULL_PULL_AT + 2 * HOUR_MS, fullPullIntervalMs: HOUR_MS }).reason)
      .toBe('reconcile-interval');
    expect(resolvePullCursor({ cursor: cursor(), scope, now: FULL_PULL_AT + 2 * HOUR_MS, fullPullIntervalMs: 3 * HOUR_MS }).mode)
      .toBe('incremental');
  });

  it('falls back to a full pull when the device clock moved behind the last full pull', () => {
    expect(resolvePullCursor({ cursor: cursor(), scope, now: FULL_PULL_AT - 1 })).toEqual({
      lastPulledAt: null,
      mode: 'full',
      reason: 'clock-backwards',
    });
  });

  it('stays incremental when now equals the last full pull instant', () => {
    expect(resolvePullCursor({ cursor: cursor(), scope, now: FULL_PULL_AT }).mode).toBe('incremental');
  });

  it('falls back to a full pull when the stored schema differs', () => {
    expect(resolvePullCursor({ cursor: cursor({ v: DEVOTIONAL_PULL_CURSOR_SCHEMA + 1 }), scope, now: oneHourLater }).reason)
      .toBe('schema-changed');
    expect(resolvePullCursor({ cursor: cursor({ v: 0 }), scope, now: oneHourLater }).reason)
      .toBe('schema-changed');
  });

  it('falls back to a full pull when the device identity changed (reset / rotation)', () => {
    expect(resolvePullCursor({ cursor: cursor({ deviceId: 'device-b' }), scope, now: oneHourLater })).toEqual({
      lastPulledAt: null,
      mode: 'full',
      reason: 'device-changed',
    });
  });

  it('falls back to a full pull when a different devotional is being pulled', () => {
    expect(resolvePullCursor({ cursor: cursor({ devotionalId: 'devotional-2' }), scope, now: oneHourLater }).reason)
      .toBe('devotional-changed');
  });

  it('falls back to a full pull when the app / store version marker changed', () => {
    expect(resolvePullCursor({
      cursor: cursor({ versionMarker: 'app:1.2.2+44|store:v40|cursor:v1' }),
      scope,
      now: oneHourLater,
    })).toEqual({
      lastPulledAt: null,
      mode: 'full',
      reason: 'version-changed',
    });
  });

  it('falls back to a full pull when the stored server timestamp is unparseable', () => {
    expect(resolvePullCursor({ cursor: cursor({ lastPulledAt: 'not-a-date' }), scope, now: oneHourLater }).reason)
      .toBe('invalid-cursor');
    expect(resolvePullCursor({ cursor: cursor({ lastPulledAt: '' }), scope, now: oneHourLater }).reason)
      .toBe('invalid-cursor');
  });

  it('falls back to a full pull when the stored full-pull time is not a positive finite number', () => {
    for (const lastFullPullAt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolvePullCursor({ cursor: cursor({ lastFullPullAt }), scope, now: oneHourLater }).reason)
        .toBe('invalid-cursor');
    }
  });

  it('falls back to a full pull when now is not a finite number', () => {
    expect(resolvePullCursor({ cursor: cursor(), scope, now: Number.NaN }).reason).toBe('invalid-cursor');
  });

  it('checks forceFull before every other rule', () => {
    expect(resolvePullCursor({ cursor: null, scope, now: oneHourLater, forceFull: true }).reason).toBe('forced');
    expect(resolvePullCursor({
      cursor: cursor({ deviceId: 'device-b' }),
      scope,
      now: oneHourLater,
      forceFull: true,
      hasLocalContent: false,
    }).reason).toBe('forced');
  });

  it('always pairs full mode with a null lastPulledAt and incremental mode with a string', () => {
    const decisions = [
      resolvePullCursor({ cursor: null, scope, now: oneHourLater }),
      resolvePullCursor({ cursor: cursor(), scope, now: oneHourLater }),
      resolvePullCursor({ cursor: cursor(), scope, now: FULL_PULL_AT + 2 * DEVOTIONAL_FULL_PULL_INTERVAL_MS }),
    ];
    for (const decision of decisions) {
      if (decision.mode === 'full') {
        expect(decision.lastPulledAt).toBeNull();
        expect(decision.reason).not.toBe('incremental');
      } else {
        expect(typeof decision.lastPulledAt).toBe('string');
        expect(decision.reason).toBe('incremental');
      }
    }
  });
});

describe('cursor (de)serialization', () => {
  it('round-trips a cursor through JSON', () => {
    const stored = cursor();
    expect(parseDevotionalPullCursor(serializeDevotionalPullCursor(stored))).toEqual(stored);
  });

  it('drops unknown fields on serialize', () => {
    const serialized = serializeDevotionalPullCursor({ ...cursor(), extra: true } as DevotionalPullCursor);
    expect(JSON.parse(serialized)).not.toHaveProperty('extra');
  });

  it('returns null for empty, malformed, or non-object storage values', () => {
    expect(parseDevotionalPullCursor(null)).toBeNull();
    expect(parseDevotionalPullCursor(undefined)).toBeNull();
    expect(parseDevotionalPullCursor('')).toBeNull();
    expect(parseDevotionalPullCursor('{not json')).toBeNull();
    expect(parseDevotionalPullCursor('"a string"')).toBeNull();
    expect(parseDevotionalPullCursor('42')).toBeNull();
    expect(parseDevotionalPullCursor('null')).toBeNull();
    expect(parseDevotionalPullCursor('[]')).toBeNull();
  });

  it('returns null when any required field is missing or has the wrong type', () => {
    const valid = JSON.parse(serializeDevotionalPullCursor(cursor())) as Record<string, unknown>;
    const broken: Record<string, unknown>[] = [
      { ...valid, v: '1' },
      { ...valid, v: Number.NaN },
      { ...valid, deviceId: '' },
      { ...valid, deviceId: 7 },
      { ...valid, devotionalId: undefined },
      { ...valid, versionMarker: null },
      { ...valid, lastPulledAt: 12345 },
      { ...valid, lastPulledAt: '' },
      { ...valid, lastFullPullAt: '1714000000000' },
      { ...valid, lastFullPullAt: null },
    ];
    for (const record of broken) {
      expect(parseDevotionalPullCursor(JSON.stringify(record))).toBeNull();
    }
  });

  it('parses a cursor with a foreign schema version so the resolver can reject it explicitly', () => {
    const parsed = parseDevotionalPullCursor(serializeDevotionalPullCursor(cursor({ v: 99 })));
    expect(parsed?.v).toBe(99);
  });
});

describe('isValidTimestamp', () => {
  it('accepts parseable ISO strings only', () => {
    expect(isValidTimestamp('2026-04-25T12:00:00.000Z')).toBe(true);
    expect(isValidTimestamp('')).toBe(false);
    expect(isValidTimestamp('yesterday')).toBe(false);
    expect(isValidTimestamp(1714000000000)).toBe(false);
    expect(isValidTimestamp(null)).toBe(false);
    expect(isValidTimestamp(undefined)).toBe(false);
  });
});

describe('buildNextDevotionalPullCursor', () => {
  it('creates a fresh record from a committed full pull when nothing was stored', () => {
    const next = buildNextDevotionalPullCursor(null, committed({ mode: 'full' }));

    expect(next).toEqual({
      v: DEVOTIONAL_PULL_CURSOR_SCHEMA,
      ...scope,
      lastPulledAt: '2026-04-25T13:00:00.000Z',
      lastFullPullAt: FULL_PULL_AT + HOUR_MS,
    });
  });

  it('replaces a record of a different identity on a committed full pull', () => {
    const stored = cursor({ deviceId: 'device-b', lastFullPullAt: FULL_PULL_AT + 5 * HOUR_MS });
    const next = buildNextDevotionalPullCursor(stored, committed({ mode: 'full' }));

    expect(next).toEqual({
      v: DEVOTIONAL_PULL_CURSOR_SCHEMA,
      ...scope,
      lastPulledAt: '2026-04-25T13:00:00.000Z',
      // The other identity's full-pull clock must not leak into the new record.
      lastFullPullAt: FULL_PULL_AT + HOUR_MS,
    });
  });

  it('extends a matching record on a committed incremental pull and keeps its full-pull clock', () => {
    const next = buildNextDevotionalPullCursor(cursor(), committed());

    expect(next).toEqual(cursor({ lastPulledAt: '2026-04-25T13:00:00.000Z' }));
  });

  it('refuses to persist an incremental pull with no matching baseline record', () => {
    expect(buildNextDevotionalPullCursor(null, committed())).toBeNull();
    expect(buildNextDevotionalPullCursor(cursor({ deviceId: 'device-b' }), committed())).toBeNull();
    expect(buildNextDevotionalPullCursor(cursor({ devotionalId: 'devotional-2' }), committed())).toBeNull();
    expect(buildNextDevotionalPullCursor(cursor({ versionMarker: 'other' }), committed())).toBeNull();
    expect(buildNextDevotionalPullCursor(cursor({ v: DEVOTIONAL_PULL_CURSOR_SCHEMA + 1 }), committed())).toBeNull();
    expect(buildNextDevotionalPullCursor(cursor({ lastPulledAt: 'garbage' }), committed())).toBeNull();
    expect(buildNextDevotionalPullCursor(cursor({ lastFullPullAt: 0 }), committed())).toBeNull();
  });

  it('refuses to persist anything without a valid server timestamp', () => {
    expect(buildNextDevotionalPullCursor(cursor(), committed({ timestamp: '' }))).toBeNull();
    expect(buildNextDevotionalPullCursor(cursor(), committed({ timestamp: 'soon' }))).toBeNull();
    expect(buildNextDevotionalPullCursor(null, committed({ mode: 'full', timestamp: 'soon' }))).toBeNull();
  });

  it('refuses to persist anything without a valid request clock', () => {
    expect(buildNextDevotionalPullCursor(null, committed({ mode: 'full', startedAt: Number.NaN }))).toBeNull();
    expect(buildNextDevotionalPullCursor(null, committed({ mode: 'full', startedAt: 0 }))).toBeNull();
  });

  it('never moves the server cursor backwards when an older response commits last', () => {
    const stored = cursor({ lastPulledAt: '2026-04-25T14:00:00.000Z' });

    const afterDelta = buildNextDevotionalPullCursor(stored, committed({ timestamp: '2026-04-25T13:00:00.000Z' }));
    expect(afterDelta?.lastPulledAt).toBe('2026-04-25T14:00:00.000Z');

    const afterFull = buildNextDevotionalPullCursor(stored, committed({ mode: 'full', timestamp: '2026-04-25T13:00:00.000Z' }));
    expect(afterFull?.lastPulledAt).toBe('2026-04-25T14:00:00.000Z');
  });

  it('never moves the full-pull clock backwards when an older full pull commits last', () => {
    const stored = cursor({ lastFullPullAt: FULL_PULL_AT + 3 * HOUR_MS });
    const next = buildNextDevotionalPullCursor(stored, committed({ mode: 'full', startedAt: FULL_PULL_AT + HOUR_MS }));

    expect(next?.lastFullPullAt).toBe(FULL_PULL_AT + 3 * HOUR_MS);
  });

  it('produces a record the resolver accepts as incremental', () => {
    const next = buildNextDevotionalPullCursor(null, committed({ mode: 'full' }));
    expect(next).not.toBeNull();

    const decision = resolvePullCursor({ cursor: next, scope, now: (next?.lastFullPullAt ?? 0) + HOUR_MS });
    expect(decision.mode).toBe('incremental');
    expect(decision.lastPulledAt).toBe(
      new Date(Date.parse('2026-04-25T13:00:00.000Z') - DEVOTIONAL_PULL_CURSOR_OVERLAP_MS).toISOString(),
    );
  });
});
