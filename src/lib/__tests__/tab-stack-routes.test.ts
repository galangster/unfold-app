import { resolveStackRoute, tabGroupToFrom } from '../tab-stack-routes';

describe('resolveStackRoute', () => {
  it('keeps a shared screen inside the host tab that mounts it', () => {
    expect(resolveStackRoute('(study)', 'series-detail')).toBe('/(tabs)/(study)/series-detail');
    expect(resolveStackRoute('(study)', 'past-devotionals')).toBe('/(tabs)/(study)/past-devotionals');
    expect(resolveStackRoute('(today)', 'series-detail')).toBe('/(tabs)/(today)/series-detail');
    expect(resolveStackRoute('(today)', 'past-devotionals')).toBe('/(tabs)/(today)/past-devotionals');
    expect(resolveStackRoute('(you)', 'series-detail')).toBe('/(tabs)/(you)/series-detail');
    expect(resolveStackRoute('(you)', 'past-devotionals')).toBe('/(tabs)/(you)/past-devotionals');
  });

  it('keeps the reader and its child screens inside a host that mounts them', () => {
    expect(resolveStackRoute('(study)', 'reading')).toBe('/(tabs)/(study)/reading');
    expect(resolveStackRoute('(study)', 'day-menu')).toBe('/(tabs)/(study)/day-menu');
    expect(resolveStackRoute('(study)', 'journal')).toBe('/(tabs)/(study)/journal');
    expect(resolveStackRoute('(study)', 'journal-detail')).toBe('/(tabs)/(study)/journal-detail');
    expect(resolveStackRoute('(study)', 'my-content')).toBe('/(tabs)/(study)/my-content');
    expect(resolveStackRoute('(today)', 'reading')).toBe('/(tabs)/(today)/reading');
    expect(resolveStackRoute('(today)', 'day-menu')).toBe('/(tabs)/(today)/day-menu');
    expect(resolveStackRoute('(today)', 'journal')).toBe('/(tabs)/(today)/journal');
    expect(resolveStackRoute('(you)', 'reading')).toBe('/(tabs)/(today)/reading');
  });

  it('falls back to the canonical host when no host tab is supplied', () => {
    expect(resolveStackRoute(undefined, 'series-detail')).toBe('/(tabs)/(you)/series-detail');
    expect(resolveStackRoute(undefined, 'past-devotionals')).toBe('/(tabs)/(you)/past-devotionals');
    expect(resolveStackRoute(undefined, 'reading')).toBe('/(tabs)/(today)/reading');
    expect(resolveStackRoute(undefined, 'my-content')).toBe('/(tabs)/(you)/my-content');
  });
});

describe('tabGroupToFrom', () => {
  it('stamps an origin only for Study hand-offs', () => {
    expect(tabGroupToFrom('(study)')).toBe('study');
    expect(tabGroupToFrom('(today)')).toBeUndefined();
    expect(tabGroupToFrom('(you)')).toBeUndefined();
    expect(tabGroupToFrom(undefined)).toBeUndefined();
  });
});
