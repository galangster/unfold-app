import { readdirSync, existsSync, readFileSync } from 'fs';
import * as path from 'path';

import { resolveStackRoute, type SharedScreen } from '../tab-stack-routes';

/**
 * Source-string contract for the Study tab.
 *
 * These assert on source text (matching tab-chrome-and-library-deslop-pr4 and
 * today-motion-regression) because the tab bar pulls in BlurView / Reanimated
 * and is not cheaply renderable under jest. Each case pins one trap that a
 * prior plan fell into.
 */

const sourceRoot = path.resolve(__dirname, '..', '..');
const studyDir = path.join(sourceRoot, 'app', '(tabs)', '(study)');

function readSource(relativePath: string): string {
  return readFileSync(path.join(sourceRoot, relativePath), 'utf8');
}

const studyLayout = readSource('app/(tabs)/(study)/_layout.tsx');
const tabBar = readSource('app/(tabs)/_layout.tsx');
const tooltips = readSource('components/HomeOnboardingTooltips.tsx');

describe('Study tab route group', () => {
  const studyScreens = readdirSync(studyDir)
    .filter((f) => f.endsWith('.tsx') && f !== '_layout.tsx')
    .map((f) => f.replace(/\.tsx$/, ''));

  it('gives every Study route a Stack.Screen entry', () => {
    // A file route with no Stack.Screen entry silently loses its presentation
    // and animation options. Mechanised so every future addition is caught.
    expect(studyScreens.length).toBeGreaterThan(0);
    for (const screen of studyScreens) {
      expect(studyLayout).toMatch(new RegExp(`<Stack\\.Screen\\s+name="${screen}"`));
    }
  });

  it('never routes a Study visitor into the invisible (you) stack', () => {
    // (you) is href:null, so a push into it from Study strands the user on a
    // tab the bar does not draw.
    for (const screen of studyScreens) {
      const src = readSource(`app/(tabs)/(study)/${screen}.tsx`);
      expect(src).not.toContain('/(tabs)/(you)/');
    }
    const shared: SharedScreen[] = [
      'series-detail',
      'past-devotionals',
      'reading',
      'day-menu',
      'journal',
      'journal-detail',
      'my-content',
    ];
    for (const screen of shared) {
      expect(resolveStackRoute('(study)', screen)).not.toContain('(you)');
    }
  });

  it('registers a Study reader and the day-menu formSheet', () => {
    expect(existsSync(path.join(studyDir, 'reading.tsx'))).toBe(true);
    expect(existsSync(path.join(studyDir, 'day-menu.tsx'))).toBe(true);
    expect(studyLayout).toContain('name="reading"');
    expect(studyLayout).toContain("presentation: 'formSheet'");
  });
});

describe('Study tab bar registration', () => {
  it('gives Study its own icon instead of a second house', () => {
    const studyCase = tabBar.indexOf("case '(study)':");
    const houseDefault = tabBar.indexOf('default:\n                return <HouseIcon');
    expect(tabBar).toContain('name="(study)"');
    expect(studyCase).toBeGreaterThan(-1);
    expect(houseDefault).toBeGreaterThan(-1);
    expect(studyCase).toBeLessThan(houseDefault);
    expect(tabBar.slice(studyCase, houseDefault)).toContain('<StepsIcon {...iconProps} />');
  });

  it('labels the Study group Devotional and places it after Today', () => {
    const today = tabBar.indexOf('name="(today)"');
    const study = tabBar.indexOf('name="(study)"');
    const bible = tabBar.indexOf('name="(bible)"');
    const you = tabBar.indexOf('name="(you)"');
    expect(today).toBeGreaterThan(-1);
    expect(study).toBeGreaterThan(today);
    expect(bible).toBeGreaterThan(study);
    expect(you).toBeGreaterThan(bible);
    expect(tabBar).toContain("title: 'Devotional'");
    expect(tabBar).not.toContain("title: 'Study'");
  });

  it('resets Today in one tap even when that stack is inactive', () => {
    expect(tabBar).toContain("route.name === '(today)' || isFocused");
  });

  it('keeps the first-run spotlight divisor equal to the drawn tab count', () => {
    const declared = tabBar.match(/<Tabs\.Screen/g) ?? [];
    const hidden = tabBar.match(/href: null/g) ?? [];
    const visibleTabs = declared.length - hidden.length;
    const registry = readSource('lib/visible-tabs.ts');
    expect(registry).toContain("'(today)'");
    expect(registry).toContain("'(study)'");
    expect(tooltips).toContain('VISIBLE_TAB_GROUPS.length');
    expect(tooltips).toContain('TAB_BAR_HORIZONTAL_PADDING');
    expect(tooltips).not.toContain('usableWidth / 4');
    expect(tooltips).not.toContain('const VISIBLE_TAB_COUNT =');
    const groups = registry.match(/export const VISIBLE_TAB_GROUPS = \[([\s\S]*?)\] as const/)?.[1] ?? '';
    const registryCount = (groups.match(/'\([^']+\)'/g) ?? []).length;
    expect(registryCount).toBe(visibleTabs);
    expect(registry).toContain('export const VISIBLE_TAB_COUNT = VISIBLE_TAB_GROUPS.length');
  });
});

describe('Study tab cross-cutting registration', () => {
  it('registers (study) everywhere a tab group is enumerated', () => {
    // Without FROM_TO_TAB, getCurrentTabFromSegments returns undefined for every
    // Study screen and the beforeRemove listener hijacks every pop.
    expect(readSource('hooks/useCrossTabBack.ts')).toContain("study: '(study)'");
    expect(readSource('hooks/useCrossTabBack.ts')).toContain("study: '/(tabs)/(study)'");

    const allowlist = readSource('lib/deep-link-allowlist.ts');
    const groups = allowlist.slice(
      allowlist.indexOf('const KNOWN_ROUTE_GROUPS'),
      allowlist.indexOf('// ─── Parsing'),
    );
    expect(groups).toContain("'(study)'");
    expect(allowlist).toContain("const CROSS_TAB_FROM = ['home', 'journal', 'bible', 'you', 'study']");

    const navigation = readSource('lib/navigation.ts');
    const tabGroups = navigation.slice(
      navigation.indexOf('const TAB_GROUPS'),
      navigation.indexOf('export type TabGroupSegment'),
    );
    expect(tabGroups).toContain("'(study)'");
  });

});
