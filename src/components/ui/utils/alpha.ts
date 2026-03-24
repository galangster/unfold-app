/**
 * Convert a 6-digit hex color + opacity (0-1) into an rgba string.
 * Replaces the fragile `color + 'XX'` hex suffix pattern.
 *
 * Expects a 6-digit hex string starting with '#'.
 * Opacity values are intentional approximations for readability,
 * not exact hex-to-decimal conversions.
 *
 * Usage: alpha('#C8A55C', 0.08) → 'rgba(200, 165, 92, 0.08)'
 */
export function alpha(hex: string, opacity: number): string {
  if (__DEV__ && (!hex.startsWith('#') || hex.length !== 7)) {
    console.warn(`[alpha] Expected 6-digit hex color, got: ${hex}`);
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
