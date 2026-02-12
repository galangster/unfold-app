/**
 * Unfold Color System
 * Single source of truth for all colors in the app.
 * Supports both dark and light themes.
 */

// Color theme interface - defines the shape of all themes
export interface ColorTheme {
  // Primary backgrounds
  background: string;
  backgroundPure: string;
  backgroundElevated: string;

  // Text hierarchy
  text: string;
  textMuted: string;
  textSubtle: string;
  textHint: string;

  // Interactive elements
  inputBackground: string;
  inputBackgroundFocused: string;
  buttonBackground: string;
  buttonBackgroundPressed: string;

  // Borders
  border: string;
  borderFocused: string;
  borderStrong: string;

  // Glass effect (for liquid glass menu)
  glassBackground: string;
  glassBorder: string;

  // Accent (minimal use)
  accent: string;

  // Status
  success: string;
  error: string;
}

// Dark theme (default)
export const DarkColors: ColorTheme = {
  // Primary backgrounds
  background: '#0A0A0A',
  backgroundPure: '#000000',
  backgroundElevated: '#141210',

  // Text hierarchy
  text: '#F5F0EB',
  textMuted: 'rgba(245, 240, 235, 0.6)',
  textSubtle: 'rgba(245, 240, 235, 0.4)',
  textHint: 'rgba(245, 240, 235, 0.25)',

  // Interactive elements
  inputBackground: 'rgba(245, 240, 235, 0.05)',
  inputBackgroundFocused: 'rgba(245, 240, 235, 0.08)',
  buttonBackground: 'rgba(245, 240, 235, 0.08)',
  buttonBackgroundPressed: 'rgba(245, 240, 235, 0.14)',

  // Borders
  border: 'rgba(245, 240, 235, 0.08)',
  borderFocused: 'rgba(245, 240, 235, 0.18)',
  borderStrong: 'rgba(245, 240, 235, 0.28)',

  // Glass effect (for liquid glass menu)
  glassBackground: 'rgba(245, 240, 235, 0.12)',
  glassBorder: 'rgba(245, 240, 235, 0.18)',

  // Accent - warm gold (the signature)
  accent: '#C8A55C',

  // Status
  success: 'rgba(74, 222, 128, 0.9)',
  error: 'rgba(248, 113, 113, 0.9)',
};

// Light theme - warm, paper-like aesthetic
export const LightColors: ColorTheme = {
  // Primary backgrounds - warm cream/paper tones
  background: '#FAF7F2',
  backgroundPure: '#FFFFFF',
  backgroundElevated: '#FFFFFF',

  // Text hierarchy - warm dark tones
  text: '#1C1710',
  textMuted: 'rgba(28, 23, 16, 0.62)',
  textSubtle: 'rgba(28, 23, 16, 0.42)',
  textHint: 'rgba(28, 23, 16, 0.3)',

  // Interactive elements
  inputBackground: 'rgba(28, 23, 16, 0.04)',
  inputBackgroundFocused: 'rgba(28, 23, 16, 0.06)',
  buttonBackground: 'rgba(28, 23, 16, 0.05)',
  buttonBackgroundPressed: 'rgba(28, 23, 16, 0.1)',

  // Borders
  border: 'rgba(28, 23, 16, 0.07)',
  borderFocused: 'rgba(28, 23, 16, 0.14)',
  borderStrong: 'rgba(28, 23, 16, 0.2)',

  // Glass effect
  glassBackground: 'rgba(255, 255, 255, 0.9)',
  glassBorder: 'rgba(28, 23, 16, 0.08)',

  // Accent - deeper warm gold for light mode
  accent: '#9A7B3C',

  // Status
  success: 'rgba(34, 197, 94, 0.9)',
  error: 'rgba(239, 68, 68, 0.9)',
};

// Default export for backwards compatibility - will be overridden by theme context
export const Colors = DarkColors;

// Helper to create a color theme with a custom accent
export function createThemedColors(base: ColorTheme, accent: string): ColorTheme {
  return { ...base, accent };
}

// Navigation themes
export const DarkNavigationTheme = {
  dark: true,
  colors: {
    primary: DarkColors.text,
    background: DarkColors.background,
    card: DarkColors.background,
    text: DarkColors.text,
    border: DarkColors.border,
    notification: DarkColors.accent,
  },
  fonts: {
    regular: {
      fontFamily: 'System',
      fontWeight: '400' as const,
    },
    medium: {
      fontFamily: 'System',
      fontWeight: '500' as const,
    },
    bold: {
      fontFamily: 'System',
      fontWeight: '700' as const,
    },
    heavy: {
      fontFamily: 'System',
      fontWeight: '800' as const,
    },
  },
};

export const LightNavigationTheme = {
  dark: false,
  colors: {
    primary: LightColors.text,
    background: LightColors.background,
    card: LightColors.background,
    text: LightColors.text,
    border: LightColors.border,
    notification: LightColors.accent,
  },
  fonts: {
    regular: {
      fontFamily: 'System',
      fontWeight: '400' as const,
    },
    medium: {
      fontFamily: 'System',
      fontWeight: '500' as const,
    },
    bold: {
      fontFamily: 'System',
      fontWeight: '700' as const,
    },
    heavy: {
      fontFamily: 'System',
      fontWeight: '800' as const,
    },
  },
};

// Legacy export for backwards compatibility
export const NavigationTheme = DarkNavigationTheme;
