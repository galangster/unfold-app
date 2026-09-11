import type { ColorTheme } from '@/constants/colors';

export function resolveGeneratingPalette(
  themeColors: ColorTheme,
  isDark: boolean,
): ColorTheme & { cardBackground?: string } {
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
    };
  }

  return {
    ...themeColors,
    cardBackground: themeColors.backgroundElevated,
    buttonBackground: themeColors.accent,
    buttonBackgroundPressed: themeColors.accent,
  };
}
