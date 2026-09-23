import { getCompletionDismissRoute } from '../completion-dismiss-route';

describe('getCompletionDismissRoute', () => {
  it('returns Today after a normal day completion', () => {
    expect(getCompletionDismissRoute('day')).toBe('/(tabs)/(today)');
  });

  it('returns to next-study choices after series completion', () => {
    expect(getCompletionDismissRoute('series')).toBe('/(tabs)/(today)');
  });

  it('returns the Study arc when the day was opened from the Study tab', () => {
    expect(getCompletionDismissRoute('day', 'study')).toBe('/(tabs)/(study)');
  });

  it('returns the Study root when the reader is hosted in Study', () => {
    expect(getCompletionDismissRoute('day', undefined, '(study)')).toBe('/(tabs)/(study)');
    expect(getCompletionDismissRoute('day', undefined, '(today)')).toBe('/(tabs)/(today)');
  });

  it('returns to next-study choices regardless of series origin', () => {
    expect(getCompletionDismissRoute('series', 'study')).toBe('/(tabs)/(today)');
  });
});
