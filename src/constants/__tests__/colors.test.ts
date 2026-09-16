import { DarkColors, LightColors } from '../colors';

const AA_TEXT = 4.5;

function channelToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: [number, number, number]): number {
  return 0.2126 * channelToLinear(rgb[0]) + 0.7152 * channelToLinear(rgb[1]) + 0.0722 * channelToLinear(rgb[2]);
}

function contrastRatio(foreground: [number, number, number], background: [number, number, number]): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const [lighter, darker] = first > second ? [first, second] : [second, first];
  return (lighter + 0.05) / (darker + 0.05);
}

function parseColor(color: string): { rgb: [number, number, number]; opacity: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const value = parseInt(hex[1], 16);
    return { rgb: [(value >> 16) & 255, (value >> 8) & 255, value & 255], opacity: 1 };
  }

  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(color);
  if (!rgba) throw new Error(`unsupported color ${color}`);
  return {
    rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])],
    opacity: rgba[4] === undefined ? 1 : Number(rgba[4]),
  };
}

function renderedOn(foreground: string, background: string): [number, number, number] {
  const fg = parseColor(foreground);
  const bg = parseColor(background).rgb;
  if (fg.opacity >= 1) return fg.rgb;
  return fg.rgb.map((channel, index) => Math.round(channel * fg.opacity + bg[index] * (1 - fg.opacity))) as [
    number,
    number,
    number,
  ];
}

function contrastOnBackground(foreground: string, background: string): number {
  return contrastRatio(renderedOn(foreground, background), parseColor(background).rgb);
}

describe('theme contrast primitives', () => {
  it('keeps readable meta on textMuted at AA on the page background', () => {
    expect(contrastOnBackground(DarkColors.textMuted, DarkColors.background)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastOnBackground(LightColors.textMuted, LightColors.background)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('uses background ink on accent fills instead of white', () => {
    expect(DarkColors.contrastText).toBe(DarkColors.background);
    expect(LightColors.contrastText).toBe(LightColors.background);
    expect(contrastOnBackground(DarkColors.contrastText!, DarkColors.accent)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastOnBackground(LightColors.contrastText!, LightColors.accent)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('keeps error text at AA on the page background', () => {
    expect(LightColors.error).toBe('rgba(204, 25, 38, 0.9)');
    expect(contrastOnBackground(LightColors.error, LightColors.background)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastOnBackground(DarkColors.error, DarkColors.background)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
