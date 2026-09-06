import fs from 'node:fs';
import path from 'node:path';
import { DarkColors, LightColors } from '@/constants/colors';
import { getBookCategory, type BibleCategory } from '../bible-constants';
import {
  BIBLE_HUB_CATEGORY_TEXT_DARK,
  BIBLE_HUB_CATEGORY_TEXT_LIGHT,
  BIBLE_HUB_INK_BLACK,
  BIBLE_HUB_INK_WHITE,
  BIBLE_HUB_MIN_TEXT_CONTRAST,
  bibleHubBookChrome,
  bibleHubCategoryFill,
  bibleHubCategoryText,
  bibleHubContrastInk,
  contrastRatio,
} from '../bible-hub-category-palette';

function accentThemeFills(): { id: string; fill: string; mode: 'dark' | 'light' }[] {
  const source = fs.readFileSync(path.join(__dirname, '../store.ts'), 'utf8');
  const block = source.slice(
    source.indexOf('export const ACCENT_THEMES'),
    source.indexOf('export const READING_FONTS'),
  );
  return [...block.matchAll(/\{ id: '([^']+)', name: '[^']+', dark: '(#[0-9A-Fa-f]{6})', light: '(#[0-9A-Fa-f]{6})' \}/g)]
    .flatMap((match) => [
      { id: match[1], fill: match[2], mode: 'dark' as const },
      { id: match[1], fill: match[3], mode: 'light' as const },
    ]);
}

const CATEGORIES = Object.keys(BIBLE_HUB_CATEGORY_TEXT_DARK) as BibleCategory[];

describe('bible hub category palette contrast', () => {
  it('keeps historical dark text and restored light hues at 4.5:1 on composited fills', () => {
    for (const category of CATEGORIES) {
      const darkText = bibleHubCategoryText(category, true);
      const lightText = bibleHubCategoryText(category, false);
      const darkFill = bibleHubCategoryFill(category, true, DarkColors.background);
      const lightFill = bibleHubCategoryFill(category, false, LightColors.background);
      expect(darkText).toBe(BIBLE_HUB_CATEGORY_TEXT_DARK[category]);
      expect(lightText).toBe(BIBLE_HUB_CATEGORY_TEXT_LIGHT[category]);
      expect(contrastRatio(darkText, darkFill)).toBeGreaterThanOrEqual(BIBLE_HUB_MIN_TEXT_CONTRAST);
      expect(contrastRatio(lightText, lightFill)).toBeGreaterThanOrEqual(BIBLE_HUB_MIN_TEXT_CONTRAST);
    }
  });

  it('deepens only the light Law, teal, and Prophecy hues that failed on an 8% fill', () => {
    expect(BIBLE_HUB_CATEGORY_TEXT_LIGHT.pentateuch).toBe('#B24831');
    expect(BIBLE_HUB_CATEGORY_TEXT_LIGHT.gospels).toBe('#B24831');
    expect(BIBLE_HUB_CATEGORY_TEXT_LIGHT.minorProphets).toBe('#2D7667');
    expect(BIBLE_HUB_CATEGORY_TEXT_LIGHT.acts).toBe('#2D7667');
    expect(BIBLE_HUB_CATEGORY_TEXT_LIGHT.prophecy).toBe('#2D7648');
    expect(BIBLE_HUB_CATEGORY_TEXT_LIGHT.historical).toBe('#6E685E');
    expect(BIBLE_HUB_CATEGORY_TEXT_DARK.pentateuch).toBe('#F59378');
    expect(BIBLE_HUB_CATEGORY_TEXT_DARK.acts).toBe('#7ED0BE');
  });

  it('picks black or white ink on every ACCENT_THEMES solid fill', () => {
    const fills = accentThemeFills();
    expect(fills).toHaveLength(14);
    for (const { fill } of fills) {
      const ink = bibleHubContrastInk(fill);
      const other = ink === BIBLE_HUB_INK_BLACK ? BIBLE_HUB_INK_WHITE : BIBLE_HUB_INK_BLACK;
      expect([BIBLE_HUB_INK_BLACK, BIBLE_HUB_INK_WHITE]).toContain(ink);
      expect(contrastRatio(ink, fill)).toBeGreaterThanOrEqual(BIBLE_HUB_MIN_TEXT_CONTRAST);
      expect(contrastRatio(ink, fill)).toBeGreaterThanOrEqual(contrastRatio(other, fill));
    }
  });

  it('keeps selected accent fills legible in both themes', () => {
    const darkSelected = bibleHubBookChrome({
      category: getBookCategory(1),
      isDark: true,
      isSelected: true,
      background: DarkColors.background,
      accent: DarkColors.accent,
      text: DarkColors.text,
    });
    const lightSelected = bibleHubBookChrome({
      category: getBookCategory(1),
      isDark: false,
      isSelected: true,
      background: LightColors.background,
      accent: LightColors.accent,
      text: LightColors.text,
    });

    expect(darkSelected.borderColor).toBe(DarkColors.accent);
    expect(darkSelected.color).toBe(DarkColors.accent);
    expect(lightSelected.borderColor).toBe(LightColors.accent);
    expect(lightSelected.color).toBe(LightColors.text);
    expect(contrastRatio(darkSelected.color, darkSelected.backgroundColor)).toBeGreaterThanOrEqual(
      BIBLE_HUB_MIN_TEXT_CONTRAST,
    );
    expect(contrastRatio(lightSelected.color, lightSelected.backgroundColor)).toBeGreaterThanOrEqual(
      BIBLE_HUB_MIN_TEXT_CONTRAST,
    );
  });

  it('uses distinct History colors for OT History and Acts', () => {
    expect(bibleHubCategoryText(getBookCategory(6), false)).toBe('#6E685E');
    expect(bibleHubCategoryText(getBookCategory(44), false)).toBe('#2D7667');
    expect(bibleHubCategoryText(getBookCategory(6), true)).toBe('#B8B0A2');
    expect(bibleHubCategoryText(getBookCategory(44), true)).toBe('#7ED0BE');
  });
});
