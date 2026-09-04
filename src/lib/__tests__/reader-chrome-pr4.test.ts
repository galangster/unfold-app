import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '../../..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8');
}

// PR4 Tier-2/3 — Reader chrome lane
//   #11 (refresh banner)      — flagged: no blue refresh banner exists; reader
//                               indicators are already accent-toned (asserted below).
//   #24 (reader portion)      — serif-toned reader loading skeleton, RM-aware.
//   #13 (Companion portion)   — horizontal edge fade on the suggestion-chip row.
//   #25 (book-nav portion)    — kill rainbow getBookColor in BookChapterNavigator;
//                               delete now-unused getBookColor / CATEGORY_COLORS.

describe('Reader loading skeleton (#24)', () => {
  const source = readSource('src/app/(tabs)/(today)/reading.tsx');

  it('renders a serif-toned reader skeleton while the series hydrates', () => {
    expect(source).toContain('function ReaderLoadingSkeleton');
    expect(source).toContain('function ReaderSkeletonBlock');
    // Wired into the hydrating branch, replacing the bare "Loading series…" spinner.
    expect(source).toContain('<ReaderLoadingSkeleton colors={colors} />');
    expect(source).not.toContain("'Loading series…'");
  });

  it('matches the reader type rhythm (title → reference → body blocks)', () => {
    // An accent-toned reference block + neutral title/body blocks.
    expect(source).toContain('alpha(colors.accent, 0.1)');
    expect(source).toContain('alpha(colors.text, 0.07)');
  });

  it('is reduce-motion aware — static poster, no shimmer when reduced', () => {
    expect(source).toContain('const reducedMotion = useReducedMotion();');
    expect(source).toMatch(/useSharedValue\(reducedMotion \? 0\.5 : 0\.35\)/);
    expect(source).toMatch(/if \(reducedMotion\) return;/);
  });

  it('exposes the skeleton to assistive tech as a progress indicator', () => {
    expect(source).toContain('accessibilityRole="progressbar"');
    expect(source).toContain('accessibilityLabel="Loading reading"');
  });

  it('keeps reader loading indicators accent-toned, never the iOS-blue default (#11)', () => {
    // Every ActivityIndicator in reader chrome carries an explicit brand color.
    const indicatorColors = source.match(/<ActivityIndicator[^>]*?color=\{([^}]+)\}/g) ?? [];
    expect(indicatorColors.length).toBeGreaterThan(0);
    for (const tag of indicatorColors) {
      // `background` included for a spinner riding on a solid accent-colored
      // button (contrast color, same convention the button's own icon uses)
      // — still theme-derived, never a hardcoded blue.
      expect(tag).toMatch(/colors\.(accent|text|textSubtle|textMuted|background)/);
    }
    // No stock blue refresh/pull-to-refresh banner remains to re-theme.
    expect(source).not.toContain('RefreshControl');
    expect(source).not.toMatch(/#007AFF|#0A84FF/i);
  });
});

describe('Companion suggestion-chip edge fade (#13)', () => {
  const source = readSource('src/components/companion/SuggestionChips.tsx');

  it('wraps the chip row in a horizontal MaskedView fade', () => {
    expect(source).toContain("import MaskedView from '@react-native-masked-view/masked-view'");
    expect(source).toContain('<MaskedView');
    // Horizontal gradient — left→right, fading both bezel edges.
    expect(source).toContain("start={{ x: 0, y: 0.5 }}");
    expect(source).toContain("end={{ x: 1, y: 0.5 }}");
    expect(source).toContain("colors={['transparent', 'black', 'black', 'transparent']}");
  });

  it('keeps the leading band tight to preserve the 56pt companion-text alignment', () => {
    // Shared COMPANION_TEXT_INDENT constant (== 56) replaces the repeated magic number.
    expect(source).toContain('paddingLeft: COMPANION_TEXT_INDENT');
    expect(source).toContain('const CHIP_LEADING_FADE = 0.02;');
    expect(source).toContain('const CHIP_TRAILING_FADE = 0.09;');
    expect(source).toContain('locations={[0, CHIP_LEADING_FADE, 1 - CHIP_TRAILING_FADE, 1]}');
  });
});

describe('Book navigator — single accent, no rainbow (#25)', () => {
  const navSource = readSource('src/components/bible/BookChapterNavigator.tsx');
  const constantsSource = readSource('src/lib/bible-constants.ts');

  it('removes the per-book rainbow color coding from the navigator', () => {
    expect(navSource).not.toContain('getBookColor');
    expect(navSource).not.toContain('bookColor');
    expect(navSource).not.toContain('CATEGORY_COLORS');
  });

  it('codes book chips neutral with a single accent selected-state', () => {
    expect(navSource).toContain('color: isCurrentBook ? colors.accent : colors.text');
    expect(navSource).toContain('borderColor: colors.accent');
    expect(navSource).toContain('alpha(colors.accent, 0.16)');
    expect(navSource).toContain('accessibilityState={{ selected: isCurrentBook }}');
  });

  it('deletes the now-unused getBookColor + CATEGORY_COLORS from bible-constants', () => {
    expect(constantsSource).not.toContain('export function getBookColor');
    expect(constantsSource).not.toContain('CATEGORY_COLORS_DARK');
    expect(constantsSource).not.toContain('CATEGORY_COLORS_LIGHT');
    // getBookCategory + CATEGORY_LABELS must survive — they carry no per-category color.
    expect(constantsSource).toContain('export function getBookCategory');
    expect(constantsSource).toContain('export const CATEGORY_LABELS');
  });
});
