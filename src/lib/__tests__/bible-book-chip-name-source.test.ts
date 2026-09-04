/**
 * The Bible search/navigator book grid used to show only the 3-4 letter
 * abbreviation ("Gen", "1Chr"), which reads poorly for a first-time or
 * low-vision reader. It should show the full book name, keeping the
 * abbreviation as a secondary line only when it actually fits the chip.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BIBLE_BOOKS } from '../bible-constants';

const source = readFileSync(join(__dirname, '../../components/bible/BookChapterNavigator.tsx'), 'utf8');

describe('BookChapterNavigator book chip source contract', () => {
  it('renders the full book name as the primary chip text', () => {
    const renderBookChipsIdx = source.indexOf('const renderBookChips');
    expect(renderBookChipsIdx).toBeGreaterThan(-1);
    const chipBlock = source.slice(renderBookChipsIdx, renderBookChipsIdx + 1800);
    expect(chipBlock).toContain('{book.name}');
    // The abbreviation is no longer the primary label.
    expect(chipBlock).not.toMatch(/>\s*\{book\.abbreviation\}\s*<\/Text>/);
  });

  it('only renders the abbreviation as a secondary line for names that fit', () => {
    expect(source).toMatch(
      /book\.abbreviation !== book\.name &&\s*book\.name\.length <= BOOK_CHIP_ABBREVIATION_FIT_LENGTH/,
    );
  });

  it('BOOK_CHIP_ABBREVIATION_FIT_LENGTH excludes the longest book names from the secondary line', () => {
    const match = source.match(/BOOK_CHIP_ABBREVIATION_FIT_LENGTH = (\d+)/);
    expect(match).not.toBeNull();
    const limit = Number(match![1]);

    const longNames = ['Song of Solomon', '1 Thessalonians', '2 Thessalonians'];
    for (const name of longNames) {
      const book = BIBLE_BOOKS.find((b) => b.name === name);
      expect(book).toBeDefined();
      expect(book!.name.length).toBeGreaterThan(limit);
    }

    // Ordinary book names still fit and keep their abbreviation.
    const shortNames = ['Genesis', '1 Chronicles', 'Deuteronomy'];
    for (const name of shortNames) {
      const book = BIBLE_BOOKS.find((b) => b.name === name);
      expect(book).toBeDefined();
      expect(book!.name.length).toBeLessThanOrEqual(limit);
    }
  });
});
