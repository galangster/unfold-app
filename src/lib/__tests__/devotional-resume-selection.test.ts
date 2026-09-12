import { selectSyncedCurrentDevotionalId } from '../devotional-resume-selection';

const ARCHIVE_AT = '2026-09-12T15:00:00.000Z';
const RESUME_AT = '2026-09-12T16:00:00.000Z';
const NEWER_RESUME_AT = '2026-09-12T17:00:00.000Z';
const OLDER_AT = '2026-09-12T14:00:00.000Z';

describe('selectSyncedCurrentDevotionalId', () => {
  it('restores Today onto a newer accepted remote resume', () => {
    expect(selectSyncedCurrentDevotionalId({
      previousCurrentId: null,
      previous: [{ id: 'series-1', archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT }],
      next: [{ id: 'series-1', archivedAt: null, archivedStateAt: RESUME_AT }],
    })).toBe('series-1');
  });

  it('accepts a newer resume when the intervening archive was never pulled', () => {
    expect(selectSyncedCurrentDevotionalId({
      previousCurrentId: null,
      previous: [{ id: 'series-1', archivedAt: null, archivedStateAt: RESUME_AT }],
      next: [{ id: 'series-1', archivedAt: null, archivedStateAt: NEWER_RESUME_AT }],
    })).toBe('series-1');
    expect(selectSyncedCurrentDevotionalId({
      previousCurrentId: null,
      previous: [{ id: 'series-1', archivedAt: null, archivedStateAt: RESUME_AT }],
      next: [{ id: 'series-1', archivedAt: null, archivedStateAt: RESUME_AT }],
    })).toBeNull();
  });

  it('does not select a stale or rejected resume intent', () => {
    expect(selectSyncedCurrentDevotionalId({
      previousCurrentId: null,
      previous: [{ id: 'series-1', archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT }],
      next: [{ id: 'series-1', archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT }],
    })).toBeNull();
  });

  it('preserves an existing valid selected series when a sibling resumes', () => {
    expect(selectSyncedCurrentDevotionalId({
      previousCurrentId: 'series-2',
      previous: [
        { id: 'series-1', archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT },
        { id: 'series-2' },
      ],
      next: [
        { id: 'series-1', archivedAt: null, archivedStateAt: RESUME_AT },
        { id: 'series-2' },
      ],
    })).toBe('series-2');
  });

  it('picks the newest accepted intent clock when several resumes qualify', () => {
    expect(selectSyncedCurrentDevotionalId({
      previousCurrentId: null,
      previous: [
        { id: 'series-1', archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT },
        { id: 'series-2', archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT },
      ],
      next: [
        { id: 'series-1', archivedAt: null, archivedStateAt: RESUME_AT },
        { id: 'series-2', archivedAt: null, archivedStateAt: NEWER_RESUME_AT },
      ],
    })).toBe('series-2');
  });

  it('does not select omitted, archived, or equal-clock lifecycle rows', () => {
    expect(selectSyncedCurrentDevotionalId({
      previousCurrentId: null,
      previous: [{ id: 'series-1', archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT }],
      next: [{ id: 'series-1', archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT }],
    })).toBeNull();
    expect(selectSyncedCurrentDevotionalId({
      previousCurrentId: null,
      previous: [{ id: 'series-1', archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT }],
      next: [{ id: 'series-1', archivedAt: ARCHIVE_AT, archivedStateAt: OLDER_AT }],
    })).toBeNull();
    expect(selectSyncedCurrentDevotionalId({
      previousCurrentId: null,
      previous: [{ id: 'series-1', archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT }],
      next: [{ id: 'series-1' }],
    })).toBeNull();
  });

  it('recomputes selection when the current series is archived or deleted in the same pull', () => {
    expect(selectSyncedCurrentDevotionalId({
      previousCurrentId: 'series-1',
      previous: [
        { id: 'series-1' },
        { id: 'series-2', archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT },
      ],
      next: [
        { id: 'series-1', archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT },
        { id: 'series-2', archivedAt: null, archivedStateAt: RESUME_AT },
      ],
    })).toBe('series-2');
    expect(selectSyncedCurrentDevotionalId({
      previousCurrentId: 'series-1',
      previous: [
        { id: 'series-1' },
        { id: 'series-2', archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT },
      ],
      next: [{ id: 'series-2', archivedAt: null, archivedStateAt: RESUME_AT }],
    })).toBe('series-2');
  });
});
