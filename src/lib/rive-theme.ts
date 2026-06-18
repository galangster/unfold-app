import { darken, hexToRgb, lighten } from '@/lib/ember-system';

export const RIVE_ACCENT_NUMBER_PROPERTIES = [
  // Per-channel accent for the hardcoded particle systems. Rive scripting can't
  // consume a hex color directly, so the app passes 0-255 R/G/B channels which
  // the script uses for particle color + higher-contrast artwork generation.
  'accentR',
  'accentG',
  'accentB',
  'width',
  'height',
] as const;

export const RIVE_ACCENT_COLOR_PROPERTIES = [
  // ── Artwork (the accent) ─────────────────────────────────────────────────
  // `artwork_color` is the primary artwork color the animator binds the scene
  // art to. The rest are aliases for older/other exports (wind/leaves' baked
  // leaves don't yet expose these — they're skipped quietly until re-export).
  'artwork_color',
  'shadedArtwork_color',
  'accent_color',
  'leaf_color',
  'line_color',
  'color',
  'Color',
  // ── Glows / secondary effects (the accent) ───────────────────────────────
  // Separated from artwork so the animator can control each effect's intensity
  // inside the file; the app just passes the accent color.
  'glow_color',
  'waterfall_glow_color',
  // ── Background filled shapes (the app's theme background, NOT the accent) ──
  // Some scenes have filled shapes that depend on this; it must match the app
  // background so they render seamlessly. `background__color` (double
  // underscore) is wind/leaves' spelling; `background_color` is the v3 scenes'.
  'background_color',
  'background__color',
  'panel_color',
  // ── Feathered text-protection mask (the app background, not the accent) ────
  // start = background @ 0% opacity, end = background @ 100%. Replicates a soft
  // mask that isn't directly authorable in Rive. `maskGradient_*` is the tree
  // scene's camelCase spelling.
  'mask_gradient_start',
  'mask_gradient_end',
  'maskGradient_start',
  'maskGradient_end',
] as const;

export type RiveAccentNumberProperty = (typeof RIVE_ACCENT_NUMBER_PROPERTIES)[number];
export type RiveAccentColorProperty = (typeof RIVE_ACCENT_COLOR_PROPERTIES)[number];

export interface RiveThemeValues {
  colorValues: Record<RiveAccentColorProperty, string>;
  numberValues: Record<RiveAccentNumberProperty, number>;
}

const FALLBACK_DARK_ACCENT = '#C8A55C';
const FALLBACK_LIGHT_ACCENT = '#9A7B3C';
const FALLBACK_DARK_SURFACE = '#0A0A0A';
const FALLBACK_LIGHT_SURFACE = '#FAF7F2';

function normalizeHex(hex: string | null | undefined, fallback: string): string {
  const normalized = hex?.replace('#', '').trim();
  if (!normalized) return fallback;

  const full = normalized.length === 3
    ? normalized.split('').map((part) => `${part}${part}`).join('')
    : normalized;

  return /^[0-9a-fA-F]{6}$/.test(full) ? `#${full.toUpperCase()}` : fallback;
}

export function withAlpha(hex: string, alpha: number): string {
  const normalized = normalizeHex(hex, '#000000').slice(1);
  const a = Math.max(0, Math.min(255, Math.round(alpha * 255)));
  return `#${normalized}${a.toString(16).padStart(2, '0').toUpperCase()}`;
}

export function buildRiveThemeValues({
  accentColor,
  backgroundColor,
  isDark,
  width,
  height,
}: {
  accentColor: string;
  backgroundColor?: string;
  isDark: boolean;
  width: number;
  height: number;
}): RiveThemeValues {
  const accent = normalizeHex(accentColor, isDark ? FALLBACK_DARK_ACCENT : FALLBACK_LIGHT_ACCENT);
  const surface = normalizeHex(backgroundColor, isDark ? FALLBACK_DARK_SURFACE : FALLBACK_LIGHT_SURFACE);
  const { r, g, b } = hexToRgb(accent);

  const accentOpaque = withAlpha(accent, 1);
  const surfaceOpaque = withAlpha(surface, 1);
  // A higher-contrast variant of the artwork color: lift on dark surfaces,
  // deepen on light ones, so shaded/secondary artwork stays legible.
  const shadedArtwork = withAlpha(isDark ? lighten(accent, 0.18) : darken(accent, 0.22), 1);

  return {
    colorValues: {
      // Artwork → accent.
      artwork_color: accentOpaque,
      shadedArtwork_color: shadedArtwork,
      accent_color: accentOpaque,
      leaf_color: accentOpaque,
      line_color: accentOpaque,
      color: accentOpaque,
      Color: accentOpaque,
      // Glows → accent (intensity controlled inside the file).
      glow_color: accentOpaque,
      waterfall_glow_color: accentOpaque,
      // Background filled shapes → app theme background (opaque), so Today's
      // own surface shows through seamlessly instead of a colored wash.
      background_color: surfaceOpaque,
      background__color: surfaceOpaque,
      panel_color: surfaceOpaque,
      // Feathered text mask: background @ 0% → background @ 100%.
      mask_gradient_start: withAlpha(surface, 0),
      mask_gradient_end: surfaceOpaque,
      maskGradient_start: withAlpha(surface, 0),
      maskGradient_end: surfaceOpaque,
    },
    numberValues: {
      // 0-255 channels for the particle systems (NOT normalized 0-1).
      accentR: r,
      accentG: g,
      accentB: b,
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    },
  };
}
