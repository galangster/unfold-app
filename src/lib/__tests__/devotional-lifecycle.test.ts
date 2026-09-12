import {
  applyArchiveIntent,
  applyUnarchiveIntent,
  didDevotionalLifecycleChange,
  extractDevotionalLifecycle,
  mergeDevotionalLifecycle,
  parseLifecycleTimestamp,
} from '../devotional-lifecycle';

const ARCHIVE_AT = '2026-09-12T15:00:00.000Z';
const RESUME_AT = '2026-09-12T16:00:00.000Z';
const OLDER_AT = '2026-09-12T14:00:00.000Z';

describe('devotional lifecycle clocks', () => {
  it('parses ISO strings, Dates, and explicit null', () => {
    expect(parseLifecycleTimestamp(ARCHIVE_AT)).toBe(ARCHIVE_AT);
    expect(parseLifecycleTimestamp(new Date(ARCHIVE_AT))).toBe(ARCHIVE_AT);
    expect(parseLifecycleTimestamp(null)).toBeNull();
    expect(parseLifecycleTimestamp(undefined)).toBeUndefined();
  });

  it('extracts archive and resume payloads from a pulled row', () => {
    expect(extractDevotionalLifecycle({
      archivedAt: ARCHIVE_AT,
      archivedStateAt: ARCHIVE_AT,
    })).toEqual({
      archivedAt: ARCHIVE_AT,
      archivedStateAt: ARCHIVE_AT,
    });
    expect(extractDevotionalLifecycle({
      archivedAt: null,
      archivedStateAt: RESUME_AT,
    })).toEqual({
      archivedAt: null,
      archivedStateAt: RESUME_AT,
    });
  });

  it('keeps local archive when the incoming row omits the intent clock', () => {
    expect(mergeDevotionalLifecycle({
      local: { archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT },
      incoming: {},
    })).toEqual({
      archivedAt: ARCHIVE_AT,
      archivedStateAt: ARCHIVE_AT,
    });
  });

  it('applies a newer remote archive or unarchive', () => {
    expect(mergeDevotionalLifecycle({
      local: { archivedAt: null, archivedStateAt: OLDER_AT },
      incoming: { archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT },
    })).toEqual({
      archivedAt: ARCHIVE_AT,
      archivedStateAt: ARCHIVE_AT,
    });
    expect(mergeDevotionalLifecycle({
      local: { archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT },
      incoming: { archivedAt: null, archivedStateAt: RESUME_AT },
    })).toEqual({
      archivedAt: null,
      archivedStateAt: RESUME_AT,
    });
  });

  it('keeps a newer pending local intent against an older remote row', () => {
    expect(mergeDevotionalLifecycle({
      local: { archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT },
      incoming: { archivedAt: null, archivedStateAt: OLDER_AT },
      pendingArchivedStateAt: ARCHIVE_AT,
    })).toEqual({
      archivedAt: ARCHIVE_AT,
      archivedStateAt: ARCHIVE_AT,
    });
  });

  it('treats equal archivedStateAt as keep-local, matching server CAS lt', () => {
    expect(mergeDevotionalLifecycle({
      local: { archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT },
      incoming: { archivedAt: null, archivedStateAt: ARCHIVE_AT },
    })).toEqual({
      archivedAt: ARCHIVE_AT,
      archivedStateAt: ARCHIVE_AT,
    });
  });

  it('stamps archive and resume without dropping other series fields', () => {
    const series = {
      id: 'series-1',
      currentDay: 4,
      archivedAt: null as string | null,
      archivedStateAt: undefined,
      updatedAt: OLDER_AT,
    };
    const archived = applyArchiveIntent(series, ARCHIVE_AT);
    expect(archived).toMatchObject({
      id: 'series-1',
      currentDay: 4,
      archivedAt: ARCHIVE_AT,
      archivedStateAt: ARCHIVE_AT,
      updatedAt: ARCHIVE_AT,
    });
    expect(applyUnarchiveIntent(archived, RESUME_AT)).toMatchObject({
      id: 'series-1',
      currentDay: 4,
      archivedAt: null,
      archivedStateAt: RESUME_AT,
    });
  });

  it('bumps archivedStateAt by one millisecond when archive and resume share a clock', () => {
    const archived = applyArchiveIntent({ updatedAt: OLDER_AT }, ARCHIVE_AT);
    expect(applyUnarchiveIntent(archived, ARCHIVE_AT).archivedStateAt).toBe('2026-09-12T15:00:00.001Z');
  });

  it('detects a lifecycle change without treating missing as archived', () => {
    expect(didDevotionalLifecycleChange(
      undefined,
      {},
    )).toBe(false);
    expect(didDevotionalLifecycleChange(
      { archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT },
      { archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT },
    )).toBe(false);
    expect(didDevotionalLifecycleChange(
      { archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT },
      { archivedAt: null, archivedStateAt: RESUME_AT },
    )).toBe(true);
  });
});
