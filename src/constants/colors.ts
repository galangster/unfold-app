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

  // Gold spectrum for gradients and depth
  accentLight: string;
  accentDark: string;
  accentGlow: string;

  // Accent states
  accentHover: string;
  accentPressed: string;
  accentDisabled: string;

  // Status
  success: string;
  successLight: string;
  error: string;
  errorLight: string;

  // Status states
  successHover: string;
  errorHover: string;
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
  textHint: 'rgba(245, 240, 235, 0.38)', // Was 0.25, now 0.38 for WCAG AA (~4.5:1)

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
  glassBackground: 'rgba(245, 240, 235, 0.08)',
  glassBorder: 'rgba(245, 240, 235, 0.22)',

  // Accent - warm gold spectrum
  accent: '#C8A55C',
  accentLight: '#E8D7A8', // Shimmer highlight
  accentDark: '#8B6F3A',  // Deep shadow
  accentGlow: 'rgba(200, 165, 92, 0.3)',

  // Accent states
  accentHover: '#D4B76A',
  accentPressed: '#BC933E',
  accentDisabled: 'rgba(200, 165, 92, 0.4)',

  // Status - warm olive and terracotta
  success: '#7CB342',        // Warm olive green
  successLight: 'rgba(124, 179, 66, 0.15)',
  successHover: '#8BC34A',
  error: '#D8785F',          // Warm terracotta
  errorLight: 'rgba(216, 120, 95, 0.15)',
  errorHover: '#E08A73',
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
  textSubtle: 'rgba(28, 23, 16, 0.55)', // Was 0.42, now 0.55 for WCAG AA
  textHint: 'rgba(28, 23, 16, 0.35)',

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

  // Accent - refined gold for light mode (was muddy #9A7B3C)
  accent: '#B8944F',
  accentLight: '#D4B87A',
  accentDark: '#8B6F3A',
  accentGlow: 'rgba(184, 148, 79, 0.25)',

  // Accent states
  accentHover: '#C4A05C',
  accentPressed: '#A68845',
  accentDisabled: 'rgba(184, 148, 79, 0.4)',

  // Status - warm olive and terracotta
  success: '#6B9B3A',
  successLight: 'rgba(107, 155, 58, 0.12)',
  successHover: '#7AAF42',
  error: '#C76A52',
  errorLight: 'rgba(199, 106, 82, 0.12)',
  errorHover: '#D67D65',
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
