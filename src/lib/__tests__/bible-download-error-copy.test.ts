/**
 * Bible download errors (from bible-db.ts's downloadBibleDb) surfaced the
 * raw thrown-Error message verbatim in the DownloadBibleSheet. This maps
 * them to short, friendly copy with a safe generic fallback.
 */
import { mapBibleDownloadError } from '../../components/bible/DownloadBibleSheet';

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'Animated.View' },
  FadeInDown: { duration: () => ({ easing: () => undefined }) },
  useReducedMotion: () => true,
  Easing: {
    out: jest.fn((value) => value),
    in: jest.fn((value) => value),
    inOut: jest.fn((value) => value),
    cubic: 'cubic',
  },
}));

describe('mapBibleDownloadError', () => {
  it('returns the generic fallback for null (no error)', () => {
    expect(mapBibleDownloadError(null)).toBe('Something went wrong. Please try again.');
  });

  it.each([
    'Network request failed',
    'fetch failed',
    'The request timed out',
  ])('maps network-ish errors to offline copy: %s', (raw) => {
    expect(mapBibleDownloadError(raw)).toBe("You're offline. Check your connection and try again.");
  });

  it.each([
    'Download failed with status 500',
    'Download failed with status 503',
    'Download failed with status 404',
  ])('maps server status errors to server copy: %s', (raw) => {
    expect(mapBibleDownloadError(raw)).toBe('Our server had a problem. Please try again in a moment.');
  });

  it.each([
    'Downloaded file too small (1024 bytes), likely corrupt',
    'File not found after download',
    'Database verification failed — tables or data missing',
  ])('maps storage/corruption errors to storage copy: %s', (raw) => {
    expect(mapBibleDownloadError(raw)).toBe("Couldn't save the download. Free up storage and try again.");
  });

  it('falls back to the generic message for an unrecognized error', () => {
    expect(mapBibleDownloadError('Something bizarre happened')).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
