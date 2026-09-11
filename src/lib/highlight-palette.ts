import type { BibleHighlightColor, HighlightColor } from '@/lib/store';

export type HighlightKey = HighlightColor | BibleHighlightColor;

/** Solid swatch per highlight colour for native (non-WebView) surfaces, per theme. */
export const HIGHLIGHT_COLORS: Record<HighlightKey, { light: string; dark: string }> = {
  yellow: { light: '#FFDC64', dark: '#C8A55C' },
  green: { light: '#64C864', dark: '#6DAF7B' },
  blue: { light: '#6496FF', dark: '#5B9BD5' },
  purple: { light: '#B464C8', dark: '#9B8EC4' },
  red: { light: '#FF6464', dark: '#D4828F' },
};

/** Solid swatch for a colour; unknown or missing colours (synced data) fall back to yellow. */
export function highlightSwatch(color: string | null | undefined, isDark: boolean): string {
  const entry = (color && HIGHLIGHT_COLORS[color as HighlightKey]) || HIGHLIGHT_COLORS.yellow;
  return entry[isDark ? 'dark' : 'light'];
}
