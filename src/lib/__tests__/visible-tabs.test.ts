import { readFileSync } from 'fs';
import * as path from 'path';

import {
  TAB_BAR_HORIZONTAL_PADDING,
  VISIBLE_TAB_COUNT,
  VISIBLE_TAB_GROUPS,
  VISIBLE_TAB_TITLES,
  titleForVisibleTab,
} from '../visible-tabs';

const sourceRoot = path.resolve(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return readFileSync(path.join(sourceRoot, relativePath), 'utf8');
}

describe('visible tab registry', () => {
  it('exposes five user-facing tabs with Devotional as the Study label', () => {
    expect(VISIBLE_TAB_GROUPS).toEqual([
      '(today)',
      '(study)',
      '(bible)',
      '(ask)',
      '(journal)',
    ]);
    expect(VISIBLE_TAB_COUNT).toBe(5);
    expect(VISIBLE_TAB_TITLES['(study)']).toBe('Devotional');
    expect(titleForVisibleTab('(study)')).toBe('Devotional');
    expect(titleForVisibleTab('(you)')).toBeUndefined();
  });

  it('keeps tab-bar padding and onboarding spotlight on the same inset', () => {
    const tabBar = readSource('app/(tabs)/_layout.tsx');
    const tooltips = readSource('components/HomeOnboardingTooltips.tsx');
    expect(TAB_BAR_HORIZONTAL_PADDING).toBeLessThan(24);
    expect(tabBar).toContain('paddingHorizontal: TAB_BAR_HORIZONTAL_PADDING');
    expect(tooltips).toContain('TAB_BAR_HORIZONTAL_PADDING * 2');
  });
});
