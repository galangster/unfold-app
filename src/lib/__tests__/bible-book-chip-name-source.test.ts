/**
 * The Bible search/navigator book grid used to show only the 3-4 letter
 * abbreviation ("Gen", "1Chr"), which reads poorly for a first-time or
 * low-vision reader. It should show the full book name in equal columns and
 * let long names wrap.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, '../../components/bible/BookChapterNavigator.tsx'), 'utf8');

describe('BookChapterNavigator book chip source contract', () => {
  it('renders the full book name as the primary chip text', () => {
    const renderBookChipsIdx = source.indexOf('const renderBookChips');
    expect(renderBookChipsIdx).toBeGreaterThan(-1);
    const chipBlock = source.slice(renderBookChipsIdx, renderBookChipsIdx + 1500);
    expect(chipBlock).toContain('{book.name}');
    expect(chipBlock).not.toContain('book.abbreviation');
    expect(chipBlock).not.toContain('numberOfLines');
  });

  it('uses the measured grid width for equal book columns', () => {
    expect(source).toContain('onLayout={handleBookGridLayout}');
    expect(source).toContain('width: bookChipWidth');
    expect(source).toContain('bookPickerColumnCount(resolvedBookGridWidth, fontScale)');
  });

  it('keeps normal last-row widths and accessible touch targets', () => {
    const styleBlock = source.slice(source.indexOf('bookChip: {'), source.indexOf('chipText: {'));
    expect(styleBlock).toContain('minHeight: 44');
    expect(styleBlock).not.toContain('flexGrow');
    expect(source).toContain('accessibilityRole="button"');
    expect(source).toContain('alpha(colors.accent, 0.16)');
    expect(source).toContain('alpha(colors.text, isDark ? 0.05 : 0.035)');
  });
});
