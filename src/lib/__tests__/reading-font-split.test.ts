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
const appConfig = JSON.parse(read('../../../app.json'));
const fontConstantsSource = read('../../constants/fonts.ts');
const devotionalWebFontsSource = read('../devotional-web-fonts.ts');
const highlightFontSource = read('../../constants/bible-highlight-colors.ts');

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
    const useFontsStart = rootLayoutSource.indexOf('useFonts(shouldLoadBundledFontsAtRuntime ? {');
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

  it('embeds only the splash-critical families in native builds', () => {
    const plugin = appConfig.expo.plugins.find(
      (entry: unknown) => Array.isArray(entry) && entry[0] === 'expo-font',
    );
    expect(plugin).toBeDefined();
    const iosFonts = plugin[1].ios.fonts as string[];
    expect(iosFonts).toHaveLength(10);
    expect(iosFonts).toEqual(expect.arrayContaining([
      './assets/fonts/PPEditorialNew-Light.otf',
      './assets/fonts/Inter_400Regular.ttf',
      './assets/fonts/SourceSerifPro_400Regular.ttf',
    ]));
    for (const id of lazyIds) {
      const prefix = readingFontsBlock().match(new RegExp(`id: '${id}'[^}]*regular: '([A-Za-z]+)_`))![1];
      expect(iosFonts.join('\n')).not.toContain(prefix);
    }
  });

  it('uses iOS PostScript names while retaining runtime aliases for Expo Go and web', () => {
    expect(fontConstantsSource).toContain("'Inter-Regular'");
    expect(fontConstantsSource).toContain("'Inter_400Regular'");
    expect(fontConstantsSource).toContain('required.every((name) => loaded.has(name))');
    expect(fontConstantsSource).toContain('shouldLoadBundledFontsAtRuntime = !embeddedStartupFontsAvailable');
    expect(fontConstantsSource).toContain("'Inter_400Regular', 'Inter-Regular'");
    expect(fontConstantsSource).toContain("'SourceSerifPro_400Regular', 'SourceSerifPro-Regular'");
    expect(fontConstantsSource).toContain("'SourceSerifPro_400Regular_Italic', 'SourceSerifPro-It'");
    expect(highlightFontSource).toContain("'SourceSerifPro-Regular': 'Source Serif 4'");
    expect(highlightFontSource).toContain("'Inter-Regular': 'Inter'");
  });

  it('prepares only the selected devotional family and has no remote font dependency', () => {
    expect(devotionalWebFontsSource).toContain('const assets = WEB_FONT_ASSETS[nativeFont]');
    expect(devotionalWebFontsSource).toContain('Asset.loadAsync(moduleId)');
    expect(devotionalWebFontsSource).not.toContain('fonts.googleapis.com');
    expect(devotionalWebFontsSource).not.toContain('fonts.gstatic.com');
  });
});
