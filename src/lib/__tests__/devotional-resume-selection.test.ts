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

// "Continue this series" on another device resumes B and pauses the current
// series X on the same clock. The resume is pushed at once; the pause can
// reach the server later, so this device may pull them in separate pulls.
describe('selectSyncedCurrentDevotionalId when the current series is paused elsewhere', () => {
  const CREATED_AT = '2026-09-01T00:00:00.000Z';
  const liveX = { id: 'series-x', createdAt: '2026-09-05T00:00:00.000Z', generationMode: 'progressive' };
  const pausedB = { id: 'series-b', createdAt: CREATED_AT, generationMode: 'progressive', archivedAt: ARCHIVE_AT, archivedStateAt: ARCHIVE_AT };
  const resumedB = { ...pausedB, archivedAt: null, archivedStateAt: RESUME_AT };
  const pausedX = { ...liveX, archivedAt: RESUME_AT, archivedStateAt: RESUME_AT };

  it('follows the resumed series when the resume and the pause arrive in separate pulls', () => {
    const afterResume = selectSyncedCurrentDevotionalId({
      previousCurrentId: 'series-x',
      previous: [liveX, pausedB],
      next: [liveX, resumedB],
    });
    expect(afterResume).toBe('series-x');
    expect(selectSyncedCurrentDevotionalId({
      previousCurrentId: afterResume,
      previous: [liveX, resumedB],
      next: [pausedX, resumedB],
    })).toBe('series-b');
  });

  it('follows the resumed series when both arrive in one pull', () => {
    expect(selectSyncedCurrentDevotionalId({
      previousCurrentId: 'series-x',
      previous: [liveX, pausedB],
      next: [pausedX, resumedB],
    })).toBe('series-b');
  });

  it('never follows a series that is not the strict active winner', () => {
    const select = (next: Array<Record<string, unknown> & { id: string }>) => selectSyncedCurrentDevotionalId({
      previousCurrentId: 'series-x',
      previous: [liveX, ...next.filter((series) => series.id !== 'series-x')],
      next: [pausedX, ...next],
    });
    // No other series: Today stays empty.
    expect(select([])).toBeNull();
    // Archived, onboarding-sample and batch rows are never candidates.
    expect(select([{ ...resumedB, archivedAt: RESUME_AT }])).toBeNull();
    expect(select([{ ...resumedB, id: 'onboarding-sample-device' }])).toBeNull();
    expect(select([{ ...resumedB, generationMode: 'batch' }])).toBeNull();
    // A live sibling on the same clock leaves no strict winner.
    expect(select([resumedB, { ...resumedB, id: 'series-c' }])).toBeNull();
  });

  // Ending a series to start a new one archives the current series too. An
  // older series still live from an earlier version did not replace it.
  it('leaves Today empty when only an older live series remains', () => {
    const olderLive = { id: 'series-y', createdAt: CREATED_AT, generationMode: 'progressive', archivedAt: null, archivedStateAt: ARCHIVE_AT };
    expect(selectSyncedCurrentDevotionalId({
      previousCurrentId: 'series-x',
      previous: [liveX, olderLive],
      next: [{ ...liveX, archivedAt: NEWER_RESUME_AT, archivedStateAt: NEWER_RESUME_AT }, olderLive],
    })).toBeNull();
  });

  it('leaves Today empty when the archive carries no clock to match a resume', () => {
    expect(selectSyncedCurrentDevotionalId({
      previousCurrentId: 'series-x',
      previous: [liveX, resumedB],
      next: [{ ...liveX, archivedAt: RESUME_AT }, resumedB],
    })).toBeNull();
  });
});
