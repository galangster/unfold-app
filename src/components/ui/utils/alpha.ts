/**
 * Apply opacity to a hex or rgb/rgba color, returning an rgba() string.
 * rgb/rgba inputs keep their R/G/B and take the given opacity so washes
 * stay the source hue instead of falling back to black.
 *
 * Usage: alpha('#C8A55C', 0.08) → 'rgba(200, 165, 92, 0.08)'
 *        alpha('rgba(204, 25, 38, 0.9)', 0.1) → 'rgba(204, 25, 38, 0.1)'
 */
const CSS_RGB = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/i;

function rgbChannels(color: string): [number, number, number] | null {
  if (!color) return null;
  const trimmed = color.trim();

  if (trimmed.startsWith('#') && trimmed.length >= 7) {
    const r = parseInt(trimmed.slice(1, 3), 16);
    const g = parseInt(trimmed.slice(3, 5), 16);
    const b = parseInt(trimmed.slice(5, 7), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return [r, g, b];
  }

  const rgb = CSS_RGB.exec(trimmed);
  if (!rgb) return null;
  const r = Math.round(Number(rgb[1]));
  const g = Math.round(Number(rgb[2]));
  const b = Math.round(Number(rgb[3]));
  if (![r, g, b].every(Number.isFinite)) return null;
  return [r, g, b];
}

export function alpha(color: string, opacity: number): string {
  const rgb = rgbChannels(color);
  if (!rgb) return `rgba(0, 0, 0, ${opacity})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`;
}
