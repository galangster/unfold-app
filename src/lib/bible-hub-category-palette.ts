import type { BibleCategory } from '@/lib/bible-constants';

/**
 * Historical hub text colors from `42f1f99c^:src/lib/bible-constants.ts`.
 * Light Law / Minor Prophets / Prophecy are deepened only enough to hold
 * 4.5:1 on an 8% fill composited over LightColors.background.
 */
export const BIBLE_HUB_FILL_ALPHA = 0.08;
export const BIBLE_HUB_SELECTED_FILL_ALPHA = 0.16;
export const BIBLE_HUB_MIN_TEXT_CONTRAST = 4.5;
export const BIBLE_HUB_INK_BLACK = '#000000';
export const BIBLE_HUB_INK_WHITE = '#FFFFFF';

export const BIBLE_HUB_CATEGORY_TEXT_DARK: Record<BibleCategory, string> = {
  pentateuch: '#F59378',
  historical: '#B8B0A2',
  wisdom: '#A3C489',
  majorProphets: '#8DB6D8',
  minorProphets: '#7ED0BE',
  gospels: '#F59378',
  acts: '#7ED0BE',
  paulineEpistles: '#C79BD9',
  generalEpistles: '#9EB2E0',
  prophecy: '#7DD5A0',
};

export const BIBLE_HUB_CATEGORY_TEXT_LIGHT: Record<BibleCategory, string> = {
  pentateuch: '#B24831',
  historical: '#6E685E',
  wisdom: '#4A7038',
  majorProphets: '#3D6488',
  minorProphets: '#2D7667',
  gospels: '#B24831',
  acts: '#2D7667',
  paulineEpistles: '#7A4A90',
  generalEpistles: '#4A5E94',
  prophecy: '#2D7648',
};

export const BIBLE_HUB_OT_LEGEND: BibleCategory[] = [
  'pentateuch',
  'historical',
  'wisdom',
  'majorProphets',
  'minorProphets',
];

export const BIBLE_HUB_NT_LEGEND: BibleCategory[] = [
  'gospels',
  'acts',
  'paulineEpistles',
  'generalEpistles',
  'prophecy',
];

export function bibleHubCategoryText(category: BibleCategory, isDark: boolean): string {
  return isDark
    ? BIBLE_HUB_CATEGORY_TEXT_DARK[category]
    : BIBLE_HUB_CATEGORY_TEXT_LIGHT[category];
}

function hexRgb(hex: string): [number, number, number] {
  const match = /^#([0-9A-Fa-f]{6})$/.exec(hex.trim());
  if (!match) {
    throw new Error(`Expected a 6-digit hex color, received ${hex}`);
  }
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function channelToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexRgb(hex);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const [lighter, darker] = first > second ? [first, second] : [second, first];
  return (lighter + 0.05) / (darker + 0.05);
}

export function bibleHubContrastInk(background: string): typeof BIBLE_HUB_INK_BLACK | typeof BIBLE_HUB_INK_WHITE {
  const black = contrastRatio(BIBLE_HUB_INK_BLACK, background);
  const white = contrastRatio(BIBLE_HUB_INK_WHITE, background);
  return white > black ? BIBLE_HUB_INK_WHITE : BIBLE_HUB_INK_BLACK;
}

function compositeHex(foreground: string, background: string, opacity: number): string {
  const [fr, fg, fb] = hexRgb(foreground);
  const [br, bg, bb] = hexRgb(background);
  const clamped = Math.min(1, Math.max(0, opacity));
  const mix = (fore: number, back: number) => Math.round(fore * clamped + back * (1 - clamped));
  return `#${[mix(fr, br), mix(fg, bg), mix(fb, bb)]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

export function bibleHubCategoryFill(
  category: BibleCategory,
  isDark: boolean,
  background: string,
): string {
  return compositeHex(bibleHubCategoryText(category, isDark), background, BIBLE_HUB_FILL_ALPHA);
}

export function bibleHubBookChrome(input: {
  category: BibleCategory;
  isDark: boolean;
  isSelected: boolean;
  background: string;
  accent: string;
  text: string;
}): { backgroundColor: string; borderColor: string; color: string } {
  if (input.isSelected) {
    return {
      backgroundColor: compositeHex(
        input.accent,
        input.background,
        BIBLE_HUB_SELECTED_FILL_ALPHA,
      ),
      borderColor: input.accent,
      color: input.isDark ? input.accent : input.text,
    };
  }

  return {
    backgroundColor: bibleHubCategoryFill(input.category, input.isDark, input.background),
    borderColor: 'transparent',
    color: bibleHubCategoryText(input.category, input.isDark),
  };
}
