import { getCompletionDismissRoute } from '../completion-dismiss-route';

describe('getCompletionDismissRoute', () => {
  it('returns Today after a normal day completion', () => {
    expect(getCompletionDismissRoute('day')).toBe('/(tabs)/(today)');
  });

  it('keeps series completion in the reader', () => {
    expect(getCompletionDismissRoute('series')).toBeNull();
  });

  it('returns the Study arc when the day was opened from the Study tab', () => {
    expect(getCompletionDismissRoute('day', 'study')).toBe('/(tabs)/(study)');
  });

  it('returns the Study root when the reader is hosted in Study', () => {
    expect(getCompletionDismissRoute('day', undefined, '(study)')).toBe('/(tabs)/(study)');
    expect(getCompletionDismissRoute('day', undefined, '(today)')).toBe('/(tabs)/(today)');
  });

  it('keeps series completion in the reader regardless of origin', () => {
    expect(getCompletionDismissRoute('series', 'study')).toBeNull();
  });
});
