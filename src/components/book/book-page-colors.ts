import type { ColorTheme } from '@/constants/colors';

export type BookPageColors = {
  ink: string;
  muted: string;
  accent: string;
  surface: string;
  light: string;
  fold: string;
  rim: string;
  rule: string;
};

export function bookPageColors(colors: ColorTheme, isDark: boolean): BookPageColors {
  if (isDark) {
    return {
      ink: colors.text,
      muted: '#C9BFAD',
      accent: colors.accent,
      surface: '#1C1B17',
      light: '#2C291F',
      fold: '#5A503C',
      rim: '#494237',
      rule: '#4C4231',
    };
  }

  return {
    ink: colors.text,
    muted: '#72634F',
    accent: colors.accent,
    surface: '#F6EEDF',
    light: '#FFFAF0',
    fold: '#E4D4B9',
    rim: '#D9CBB4',
    rule: '#D2BEA0',
  };
}
