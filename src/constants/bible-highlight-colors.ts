/**
 * Highlight palette shared by the devotional WebView, the devotional
 * scripture block and the Bible reader, so a mark made in one surface
 * renders as the same ink in the others.
 *
 * The look is a highlighter stroke (chosen 2026-09-10 over a flat marker,
 * an underline wash and a pencil rule). Both themes paint a translucent
 * band behind unchanged text, never colored text, and the ink is uneven
 * like a felt tip: heavier through the middle, softer at both ends.
 */
import type { BibleHighlightColor } from '@/lib/store';

/** `rgb` is the ink; `peak` is its strongest alpha on that ground. */
export interface HighlightInk {
  rgb: string;
  peak: number;
}

export const HIGHLIGHT_INK: Record<BibleHighlightColor, { light: HighlightInk; dark: HighlightInk }> = {
  yellow: { light: { rgb: '255, 236, 80', peak: 0.72 }, dark: { rgb: '255, 232, 106', peak: 0.34 } },
  green: { light: { rgb: '180, 240, 120', peak: 0.62 }, dark: { rgb: '92, 255, 99', peak: 0.28 } },
  blue: { light: { rgb: '150, 210, 255', peak: 0.62 }, dark: { rgb: '119, 183, 255', peak: 0.32 } },
  purple: { light: { rgb: '214, 188, 255', peak: 0.56 }, dark: { rgb: '215, 168, 255', peak: 0.32 } },
  red: { light: { rgb: '255, 180, 180', peak: 0.6 }, dark: { rgb: '255, 122, 122', peak: 0.32 } },
};

export function highlightInk(color: BibleHighlightColor, isDark: boolean): HighlightInk {
  return isDark ? HIGHLIGHT_INK[color].dark : HIGHLIGHT_INK[color].light;
}

/** The felt-tip profile: soft entry, full ink by 12%, a shade lighter
 *  through the body, soft exit. Fractions of `peak` at each stop. */
export const HIGHLIGHT_STROKE_STOPS: { location: number; alpha: number }[] = [
  { location: 0, alpha: 0.47 },
  { location: 0.12, alpha: 1 },
  { location: 0.88, alpha: 0.87 },
  { location: 1, alpha: 0.42 },
];

function rgba({ rgb, peak }: HighlightInk, fraction: number): string {
  return `rgba(${rgb}, ${(peak * fraction).toFixed(2)})`;
}

/** CSS `background-image` for the WebView mark. */
export function highlighterStroke(ink: HighlightInk): string {
  const [entry, full, body, exit] = HIGHLIGHT_STROKE_STOPS;
  return `linear-gradient(100deg, ${rgba(ink, entry.alpha)}, ${rgba(ink, full.alpha)} ${full.location * 100}%, ${rgba(ink, body.alpha)} ${body.location * 100}%, ${rgba(ink, exit.alpha)})`;
}

export interface HighlighterStrokeGradient {
  colors: [string, string, ...string[]];
  locations: [number, number, ...number[]];
}

/** The same profile as `colors` + `locations` for expo-linear-gradient. */
export function highlighterStrokeGradient(ink: HighlightInk): HighlighterStrokeGradient {
  const colors = HIGHLIGHT_STROKE_STOPS.map((stop) => rgba(ink, stop.alpha)) as HighlighterStrokeGradient['colors'];
  const locations = HIGHLIGHT_STROKE_STOPS.map((stop) => stop.location) as HighlighterStrokeGradient['locations'];
  return { colors, locations };
}

/** Built once: the Bible reader renders one per highlighted verse line, so
 *  rows must not rebuild the arrays on every render. */
const HIGHLIGHT_STROKE_GRADIENTS = Object.fromEntries(
  Object.entries(HIGHLIGHT_INK).map(([color, ink]) => [
    color,
    { light: highlighterStrokeGradient(ink.light), dark: highlighterStrokeGradient(ink.dark) },
  ]),
) as Record<BibleHighlightColor, { light: HighlighterStrokeGradient; dark: HighlighterStrokeGradient }>;

export function highlighterStrokeGradientFor(color: BibleHighlightColor, isDark: boolean): HighlighterStrokeGradient {
  return isDark ? HIGHLIGHT_STROKE_GRADIENTS[color].dark : HIGHLIGHT_STROKE_GRADIENTS[color].light;
}

/** Flat fallback for surfaces that can only paint one color behind text
 *  (nested Text spans). The body alpha of the stroke, in both themes. */
export function highlighterFlatBand(ink: HighlightInk): string {
  return rgba(ink, HIGHLIGHT_STROKE_STOPS[2].alpha);
}

/** Where the stroke sits for each reading face, in em. Measured 2026-09-10
 *  from the fonts' own metrics: `top` = font-box ascent − tallest ascender
 *  − 0.05; `height` = ascender + descender + 0.10. Anchored to the letters,
 *  not to the font box, which is what made the old band float high. */
export const HIGHLIGHT_STROKE_FIT: Record<string, { top: number; height: number }> = {
  'Source Serif 4': { top: 0.24, height: 1.09 },
  'EB Garamond': { top: 0.25, height: 1.1 },
  Lora: { top: 0.2, height: 1.13 },
  Inter: { top: 0.16, height: 1.08 },
  'Crimson Text': { top: 0.22, height: 1.0 },
  Merriweather: { top: 0.1, height: 1.2 },
  Georgia: { top: 0.2, height: 1.1 },
};

/** Native reading-font family → the web family the fit table is keyed by. */
export const READING_FONT_WEB_NAMES: Record<string, string> = {
  SourceSerifPro_400Regular: 'Source Serif 4',
  EBGaramond_400Regular: 'EB Garamond',
  Lora_400Regular: 'Lora',
  Inter_400Regular: 'Inter',
  CrimsonText_400Regular: 'Crimson Text',
  Merriweather_400Regular: 'Merriweather',
};

export function webFontNameFor(nativeFont: string): string {
  return READING_FONT_WEB_NAMES[nativeFont] ?? 'Georgia';
}

export function strokeFitFor(nativeFont: string): { top: number; height: number } {
  return HIGHLIGHT_STROKE_FIT[webFontNameFor(nativeFont)] ?? HIGHLIGHT_STROKE_FIT.Georgia;
}

/** Swatch colours for the picker. */
export const HIGHLIGHT_COLORS: { key: BibleHighlightColor; color: string }[] = [
  { key: 'yellow', color: '#F0C850' },
  { key: 'green', color: '#6BBF7B' },
  { key: 'blue', color: '#6BA3D6' },
  { key: 'purple', color: '#A874C0' },
  { key: 'red', color: '#E87070' },
];

/** Text colour while a verse is selected (inverted against the selection mark). */
export const SELECTED_VERSE_TEXT = { light: '#FFFDF8', dark: '#221B12' } as const;
