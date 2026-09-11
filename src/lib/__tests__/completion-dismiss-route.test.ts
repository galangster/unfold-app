import { getCompletionDismissRoute } from '../completion-dismiss-route';

describe('getCompletionDismissRoute', () => {
  it('returns Today after a normal day completion', () => {
    expect(getCompletionDismissRoute('day')).toBe('/(tabs)/(today)');
  });

  it('keeps series completion in the reader', () => {
    expect(getCompletionDismissRoute('series')).toBeNull();
  });
});
