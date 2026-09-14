import {
  progressFillMotion,
  reflectionCheckMode,
  shouldAnnounceReadingReady,
  shouldShowBreathGuide,
} from '../meaningful-motion';

describe('meaningful motion contracts', () => {
  it('announces ready only for a live preparing-to-readable transition', () => {
    expect(shouldAnnounceReadingReady(null, 'unread')).toBe(false);
    expect(shouldAnnounceReadingReady('unread', 'unread')).toBe(false);
    expect(shouldAnnounceReadingReady('preparing', 'unread')).toBe(true);
    expect(shouldAnnounceReadingReady('preparing', 'reveal-ready')).toBe(true);
    expect(shouldAnnounceReadingReady('preparing', 'complete-today')).toBe(false);
    expect(shouldAnnounceReadingReady('unread', 'complete-today')).toBe(false);
  });

  it('snaps progress on mount, series change, and decrease, and advances only a real increase', () => {
    expect(progressFillMotion(null, { seriesKey: 'still-waters:7', progress: 43 })).toEqual({
      mode: 'snap',
      from: 43,
      to: 43,
    });
    expect(progressFillMotion(
      { seriesKey: 'still-waters:7', progress: 43 },
      { seriesKey: 'still-waters:7', progress: 57 },
    )).toEqual({
      mode: 'advance',
      from: 43,
      to: 57,
    });
    expect(progressFillMotion(
      { seriesKey: 'still-waters:7', progress: 57 },
      { seriesKey: 'new-series:5', progress: 20 },
    )).toEqual({
      mode: 'snap',
      from: 20,
      to: 20,
    });
    expect(progressFillMotion(
      { seriesKey: 'still-waters:7', progress: 57 },
      { seriesKey: 'still-waters:7', progress: 40 },
    )).toEqual({
      mode: 'snap',
      from: 40,
      to: 40,
    });
  });

  it('keeps a persisted reflection check static until a finished save matches', () => {
    expect(reflectionCheckMode({
      saveState: 'saved',
      hadPersistedResponse: true,
      finishRevision: null,
      savedRevision: null,
    })).toBe('static');

    expect(reflectionCheckMode({
      saveState: 'saved',
      hadPersistedResponse: true,
      finishRevision: null,
      savedRevision: 4,
    })).toBe('hidden');

    expect(reflectionCheckMode({
      saveState: 'saved',
      hadPersistedResponse: false,
      finishRevision: 4,
      savedRevision: 4,
    })).toBe('draw');

    expect(reflectionCheckMode({
      saveState: 'error',
      hadPersistedResponse: true,
      finishRevision: 4,
      savedRevision: 3,
    })).toBe('hidden');
  });

  it('only offers the breath guide on the breath prayer breathe step', () => {
    expect(shouldShowBreathGuide('breath_prayer', 'breathe')).toBe(true);
    expect(shouldShowBreathGuide('breath_prayer', 'copy')).toBe(false);
    expect(shouldShowBreathGuide('inductive_oia', 'breathe')).toBe(false);
  });
});
