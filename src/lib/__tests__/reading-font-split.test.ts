/**
 * Cold-start font split contract (Workstream 4 / P0-4).
 *
 * Only UI/display faces plus the DEFAULT reading family may block the splash.
 * Every other reading family must be lazy-loadable, or a user who picked it
 * would silently read in the system fallback face forever.
 *
 * Source-based so it stays runnable without an asset transformer (the loader
 * `require()`s .ttf files, which Jest cannot resolve).
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf-8');

const storeSource = read('../store.ts');
const availabilitySource = read('../reading-font-availability.ts');
const loaderSource = read('../reading-fonts-loader.ts');
const rootLayoutSource = read('../../app/_layout.tsx');

function readingFontsBlock(): string {
  const start = storeSource.indexOf('export const READING_FONTS');
  expect(start).toBeGreaterThan(-1);
  const end = storeSource.indexOf('];', start);
  return storeSource.slice(start, end);
}

function idList(source: string, constName: string): string[] {
  const start = source.indexOf(`export const ${constName}`);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf(';', start);
  return [...source.slice(start, end).matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
}

describe('reading font eager/lazy split', () => {
  const allIds = [...readingFontsBlock().matchAll(/id: '([a-z-]+)'/g)].map((m) => m[1]);
  const eagerIds = idList(availabilitySource, 'EAGER_READING_FONT_IDS');
  const lazyIds = idList(availabilitySource, 'LAZY_READING_FONT_IDS');

  it('partitions every READING_FONTS family into exactly one of eager/lazy', () => {
    expect(allIds.length).toBeGreaterThan(0);
    expect([...eagerIds, ...lazyIds].sort()).toEqual([...allIds].sort());
    expect(eagerIds.filter((id) => lazyIds.includes(id))).toEqual([]);
  });

  it('keeps the fallback family in the eager set', () => {
    const match = availabilitySource.match(/DEFAULT_READING_FONT_ID: ReadingFontId = '([a-z-]+)'/);
    expect(match).not.toBeNull();
    expect(eagerIds).toContain(match![1]);
  });

  it('gives every lazy family an entry in the on-demand asset map', () => {
    for (const id of lazyIds) {
      expect(loaderSource).toContain(`${id}: [`);
    }
  });

  it('keeps lazy families out of the splash-blocking useFonts call', () => {
    const useFontsStart = rootLayoutSource.indexOf('useFonts({');
    const useFontsBlock = rootLayoutSource.slice(
      useFontsStart,
      rootLayoutSource.indexOf('});', useFontsStart),
    );
    // Family name prefixes of the lazy set, taken from READING_FONTS itself.
    const lazyFamilyPrefixes = lazyIds.map((id) => {
      const entry = readingFontsBlock().match(
        new RegExp(`id: '${id}'[^}]*regular: '([A-Za-z]+)_`),
      );
      expect(entry).not.toBeNull();
      return entry![1];
    });
    for (const prefix of lazyFamilyPrefixes) {
      // Match the asset require, not prose — the block's explanatory comment
      // legitimately names the lazy families.
      expect(useFontsBlock).not.toContain(`assets/fonts/${prefix}_`);
    }
  });
});
