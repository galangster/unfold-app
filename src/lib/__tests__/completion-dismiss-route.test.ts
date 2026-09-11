import { getCompletionDismissRoute } from '../completion-dismiss-route';

describe('getCompletionDismissRoute', () => {
  it('returns Today after a normal day completion', () => {
    expect(getCompletionDismissRoute('day')).toBe('/(tabs)/(today)');
  });

  it('keeps series completion in the reader', () => {
    expect(getCompletionDismissRoute('series')).toBeNull();
  });

  it('routes a series completion with an auto trial id to keepsake', () => {
    expect(getCompletionDismissRoute('series', { autoTrialDevotionalId: 'auto-1' })).toEqual({
      pathname: '/keepsake',
      params: { devotionalId: 'auto-1' },
    });
  });

  it('returns Today for a day completion even when an auto trial id is present', () => {
    expect(getCompletionDismissRoute('day', { autoTrialDevotionalId: 'auto-1' })).toBe('/(tabs)/(today)');
  });
});
