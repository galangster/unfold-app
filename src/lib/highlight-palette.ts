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

/**
 * Marker band behind quoted highlight text on native surfaces. Mirrors the
 * reader's felt-tip stroke: a translucent band, never coloured text, with
 * lighter ink on a dark ground so the letters stay legible.
 */
export function highlightBandColor(color: HighlightKey | null | undefined, isDark: boolean): string {
  const hex = HIGHLIGHT_COLORS[color ?? 'yellow'][isDark ? 'dark' : 'light'];
  const alpha = isDark ? 0.3 : 0.42;
  const channel = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${alpha})`;
}
