import type { ColorTheme } from '@/constants/colors';

// Theme surfaces and accents are six-digit hex colors.
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function buttonInk(accent: string, preferred: string): string {
  const fill = luminance(accent);
  const ink = luminance(preferred);
  const contrast = (Math.max(fill, ink) + 0.05) / (Math.min(fill, ink) + 0.05);
  if (contrast >= 4.5) return preferred;
  return fill > 0.179 ? '#000000' : '#FFFFFF';
}

export function resolveGeneratingPalette(
  themeColors: ColorTheme,
  isDark: boolean,
): ColorTheme & { cardBackground?: string; contrastText: string } {
  const contrastText = buttonInk(themeColors.accent, isDark ? '#0A0A0A' : themeColors.background);
  if (isDark) {
    return {
      ...themeColors,
      background: '#0A0A0A',
      cardBackground: '#111214',
      inputBackground: '#111214',
      border: '#24262B',
      text: '#F5F5F7',
      textMuted: '#A0A6B1',
      textSubtle: '#7D8592',
      buttonBackground: themeColors.accent,
      buttonBackgroundPressed: themeColors.accent,
      contrastText,
    };
  }

  return {
    ...themeColors,
    cardBackground: themeColors.backgroundElevated,
    buttonBackground: themeColors.accent,
    buttonBackgroundPressed: themeColors.accent,
    contrastText,
  };
}
