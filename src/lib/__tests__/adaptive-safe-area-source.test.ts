/**
 * Source-contract checks for left/right safe-area edges on primary
 * screens. Full renders of these routes are too heavy for this pass.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (relativePath: string) =>
  readFileSync(join(__dirname, '../../', relativePath), 'utf8');

describe('primary screens apply left and right safe-area edges', () => {
  it('protects Today, Journal, You, and Settings on the horizontal edges', () => {
    const today = src('app/(tabs)/(today)/index.tsx');
    const journal = src('app/(tabs)/(journal)/index.tsx');
    const you = src('app/(tabs)/(you)/index.tsx');
    const settings = src('app/(tabs)/(you)/settings.tsx');

    for (const source of [today, journal, you, settings]) {
      expect(source).toContain("edges={['top', 'left', 'right']}");
      expect(source).not.toMatch(/<SafeAreaView[^>]*edges=\{\['top'\]\}/);
    }
  });

  it('adds the Profile settings-column origin to section scroll targets', () => {
    const you = src('app/(tabs)/(you)/index.tsx');
    expect(you).toContain('useSettingsSectionScroll(');
    expect(you).toContain('settingsWrapperY');
    expect(you).toContain('setSettingsWrapperY');
  });

  it('gutters the custom tab items without replacing the Tabs navigator', () => {
    const layout = src('app/(tabs)/_layout.tsx');
    expect(layout).toContain('adaptiveSafeGutterStyle(insets.left, insets.right)');
    expect(layout).toContain('<Tabs');
    expect(layout).toContain('tabBar={(props: any) => (');
  });

  it('swipes Bible chapters from the bounded reader width', () => {
    const reader = src('app/(tabs)/(bible)/reader.tsx');
    expect(reader).toContain('chapterSwipeMetrics(adaptiveLayout.readableMaxWidth)');
    expect(reader).toContain('paddingLeft: insets.left');
    expect(reader).toContain('paddingRight: insets.right');
    expect(reader).toMatch(/<View\b[^>]*style=\{\[readerFrameStyle, styles\.versesContent\]\}/);
    expect(reader).toContain('versesContent: { paddingHorizontal: Spacing[\'8\'] }');
  });
});
