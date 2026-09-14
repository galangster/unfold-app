/**
 * Accent-derived colors and clock/softening helpers for reveal fields.
 * Every tint comes from the live accent and surface. Paper is a neutral lift.
 */

export const REVEAL_GRADIENT_VARIANTS = [
  'prism',
  'sky',
  'flow',
  'aurora',
  'mesh',
  'glow',
  'bars',
] as const;

export type RevealGradientVariant = (typeof REVEAL_GRADIENT_VARIANTS)[number];

export const REVEAL_GRADIENT_MIN_SOFTEN = 15;
export const REVEAL_GRADIENT_FRAME_MS = 1000 / 30;
export const REVEAL_GRADIENT_CANVAS_SCALE = 0.5;
export const REVEAL_REPRESENTATIVE_TIME = 1.35;

export type Rgb01 = readonly [number, number, number];

type Rgba01 = readonly [number, number, number, number];

export type RevealGradientPalette = {
  background: Rgba01;
  low: Rgba01;
  mid: Rgba01;
  high: Rgba01;
  paper: Rgba01;
};

function opaque(color: Rgb01): Rgba01 {
  return [color[0], color[1], color[2], 1];
}

export type RevealClockGate = {
  active: boolean;
  reducedMotion: boolean;
  appActive: boolean;
};

export type RevealCanvasLayout = {
  width: number;
  height: number;
  enlargeX: number;
  enlargeY: number;
  canvasBlur: number;
  displaySoftening: number;
};

const PAPER_DARK: Rgb01 = [0.91, 0.89, 0.85];
const PAPER_LIGHT: Rgb01 = [0.99, 0.98, 0.955];

export function isRevealGradientVariant(value: string): value is RevealGradientVariant {
  return (REVEAL_GRADIENT_VARIANTS as readonly string[]).includes(value);
}

export function clampRevealSoftening(soften: number): number {
  if (!Number.isFinite(soften)) return REVEAL_GRADIENT_MIN_SOFTEN;
  return Math.max(REVEAL_GRADIENT_MIN_SOFTEN, soften);
}

export function shouldRevealClockRun(gate: RevealClockGate): boolean {
  return gate.active && gate.appActive && !gate.reducedMotion;
}

export function parseRevealHex(hex: string): Rgb01 {
  const cleaned = hex.replace('#', '').trim();
  const full =
    cleaned.length === 3 ? cleaned.split('').map((part) => `${part}${part}`).join('') : cleaned;
  if (!/^[0-9A-Fa-f]{6}$/.test(full)) {
    return [0.5, 0.5, 0.5];
  }
  const value = parseInt(full, 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export function mixRevealRgb(a: Rgb01, b: Rgb01, amount: number): Rgb01 {
  const t = Math.max(0, Math.min(1, amount));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function revealLuminance(color: Rgb01 | Rgba01): number {
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
}

function restrainPeak(color: Rgb01, background: Rgb01, isDark: boolean): Rgb01 {
  const maxL = isDark ? 0.7 : 0.58;
  const luminance = revealLuminance(color);
  if (luminance <= maxL) return color;
  const pull = (luminance - maxL) / Math.max(luminance, 1e-4);
  return mixRevealRgb(color, background, pull * 0.62);
}

export function buildRevealPalette(
  accent: string,
  background: string,
  isDark: boolean,
): RevealGradientPalette {
  const accentRgb = parseRevealHex(accent);
  const backgroundRgb = parseRevealHex(background);
  const paper = isDark
    ? mixRevealRgb(PAPER_DARK, accentRgb, 0.06)
    : mixRevealRgb(PAPER_LIGHT, accentRgb, 0.04);

  const low = mixRevealRgb(backgroundRgb, accentRgb, isDark ? 0.3 : 0.22);
  const mid = mixRevealRgb(backgroundRgb, accentRgb, isDark ? 0.64 : 0.52);
  const lifted = mixRevealRgb(accentRgb, paper, isDark ? 0.2 : 0.12);
  const high = restrainPeak(lifted, backgroundRgb, isDark);

  return {
    background: opaque(backgroundRgb),
    low: opaque(low),
    mid: opaque(mid),
    high: opaque(high),
    paper: opaque(paper),
  };
}

export function resolveRevealCanvas(
  displayWidth: number,
  displayHeight: number,
  soften: number,
): RevealCanvasLayout {
  const width = Math.max(1, Math.round(Math.max(displayWidth, 1) * REVEAL_GRADIENT_CANVAS_SCALE));
  const height = Math.max(1, Math.round(Math.max(displayHeight, 1) * REVEAL_GRADIENT_CANVAS_SCALE));
  const enlargeX = Math.max(displayWidth, 1) / width;
  const enlargeY = Math.max(displayHeight, 1) / height;
  const displaySoftening = clampRevealSoftening(soften);
  const enlarge = Math.min(enlargeX, enlargeY);
  return {
    width,
    height,
    enlargeX,
    enlargeY,
    canvasBlur: displaySoftening / enlarge,
    displaySoftening,
  };
}
