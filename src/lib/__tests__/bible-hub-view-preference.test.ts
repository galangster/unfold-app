import {
  BIBLE_HUB_DEFAULT_VIEW,
  bibleHubViewFromLabel,
  parseBibleHubViewPreference,
} from '../bible-hub-view-preference';

describe('bible hub view preference', () => {
  it('accepts only grid and names, and defaults everything else to grid', () => {
    expect(parseBibleHubViewPreference('grid')).toBe('grid');
    expect(parseBibleHubViewPreference('names')).toBe('names');
    expect(parseBibleHubViewPreference(undefined)).toBe(BIBLE_HUB_DEFAULT_VIEW);
    expect(parseBibleHubViewPreference(null)).toBe('grid');
    expect(parseBibleHubViewPreference('Names')).toBe('grid');
    expect(parseBibleHubViewPreference('list')).toBe('grid');
    expect(parseBibleHubViewPreference(1)).toBe('grid');
  });

  it('maps the visible Grid and Names labels to stored values', () => {
    expect(bibleHubViewFromLabel('Grid')).toBe('grid');
    expect(bibleHubViewFromLabel('Names')).toBe('names');
    expect(bibleHubViewFromLabel('grid')).toBe('grid');
  });
});
