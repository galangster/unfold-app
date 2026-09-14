import {
  AMBIENT_TRACKS,
  DEFAULT_AMBIENT_TRACK_ID,
  formatTrackDuration,
  getAmbientTrack,
  isAmbientTrackId,
  nextAmbientTrackId,
} from '../ambient-audio-catalog';

jest.mock('../../../assets/audio/piano/a-lifetime-spent-with-you.m4a', () => 11, { virtual: true });
jest.mock('../../../assets/audio/piano/river-thread.m4a', () => 12, { virtual: true });
jest.mock('../../../assets/audio/piano/tideglass-drift.m4a', () => 13, { virtual: true });
jest.mock('../../../assets/audio/piano/alpine-serenity.m4a', () => 14, { virtual: true });
jest.mock('../../../assets/audio/piano/daylight-sequence.m4a', () => 15, { virtual: true });
jest.mock('../../../assets/audio/piano/morning-light-blooms.m4a', () => 16, { virtual: true });
jest.mock('../../../assets/audio/piano/galactic-drift.m4a', () => 17, { virtual: true });
jest.mock('../../../assets/audio/piano/static-harmony.m4a', () => 18, { virtual: true });
jest.mock('../../../assets/audio/piano/silent-warmth.m4a', () => 19, { virtual: true });

describe('ambient audio catalog', () => {
  it('exports the nine approved piano names', () => {
    expect(AMBIENT_TRACKS.map((track) => track.id)).toEqual([
      'a-lifetime-spent-with-you',
      'river-thread',
      'tideglass-drift',
      'alpine-serenity',
      'daylight-sequence',
      'morning-light-blooms',
      'galactic-drift',
      'static-harmony',
      'silent-warmth',
    ]);
    expect(AMBIENT_TRACKS.map((track) => track.title)).toEqual([
      'All My Days',
      'Still Waters',
      'Deep Calls to Deep',
      'To the Hills',
      'Brighter Still',
      'Morning by Morning',
      'The Heavens',
      'Held Together',
      'Under Your Wings',
    ]);
    expect(AMBIENT_TRACKS.map((track) => track.source)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(DEFAULT_AMBIENT_TRACK_ID).toBe('a-lifetime-spent-with-you');
  });

  it('validates ids and advances to the next piece', () => {
    expect(isAmbientTrackId('river-thread')).toBe(true);
    expect(isAmbientTrackId('rain')).toBe(false);
    expect(getAmbientTrack('river-thread').title).toBe('Still Waters');
    expect(nextAmbientTrackId('silent-warmth')).toBe('a-lifetime-spent-with-you');
    expect(formatTrackDuration(195)).toBe('3:15');
  });
});
