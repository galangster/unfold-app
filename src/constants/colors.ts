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

  // Text hierarchy — use each token only in its contrast role
  /** Body copy. Dark 17.49:1 / light 16.66:1 on `background`. */
  text: string;
  /** Readable meta (12–15px). Dark 6.56:1 / light 5.94:1. Use this for real secondary copy. */
  textMuted: string;
  /** Icons and placeholders only. Dark 3.46:1 / light 3.88:1 — fails 4.5:1 as text. */
  textSubtle: string;
  /** Non-text chrome. Dark 2.04:1 / light 2.52:1. */
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
  /**
   * Ink on accent fills. Same value as `background` so filled accent
   * controls do not paint white on gold (2.34:1). Dark 8.48:1 / light 4.73:1
   * on the theme accent.
   */
  contrastText?: string;

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
  contrastText: '#0A0A0A',

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
  textMuted: 'rgba(28, 23, 16, 0.68)',
  textSubtle: 'rgba(28, 23, 16, 0.55)',
  textHint: 'rgba(28, 23, 16, 0.40)',

  // Interactive elements
  inputBackground: 'rgba(28, 23, 16, 0.06)',
  inputBackgroundFocused: 'rgba(28, 23, 16, 0.09)',
  buttonBackground: 'rgba(28, 23, 16, 0.10)',
  buttonBackgroundPressed: 'rgba(28, 23, 16, 0.14)',

  // Borders
  border: 'rgba(28, 23, 16, 0.10)',
  borderFocused: 'rgba(28, 23, 16, 0.18)',
  borderStrong: 'rgba(28, 23, 16, 0.25)',

  // Glass effect
  glassBackground: 'rgba(255, 255, 255, 0.9)',
  glassBorder: 'rgba(28, 23, 16, 0.08)',

  // Accent - deep warm gold for light mode (4.73:1 on cream — WCAG AA)
  accent: '#866B2F',
  contrastText: '#FAF7F2',

  // Status
  success: 'rgba(34, 197, 94, 0.9)',
  // 4.70:1 on #FAF7F2 — same hue as #EF4444, darker lightness
  error: 'rgba(204, 25, 38, 0.9)',
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
