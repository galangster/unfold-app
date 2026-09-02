import { createContext, useContext, useMemo, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import {
  ColorTheme,
  DarkColors,
  LightColors,
  DarkNavigationTheme,
  LightNavigationTheme,
  createThemedColors,
} from '@/constants/colors';
import { useUnfoldStore, ThemeMode, ACCENT_THEMES } from '@/lib/store';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { resolveEffectiveAccentThemeId } from '@/lib/accent-theme-policy';

interface ThemeContextType {
  colors: ColorTheme;
  navigationTheme: typeof DarkNavigationTheme;
  isDark: boolean;
  themeMode: ThemeMode;
}

const ThemeContext = createContext<ThemeContextType>({
  colors: DarkColors,
  navigationTheme: DarkNavigationTheme,
  isDark: true,
  themeMode: 'dark',
});

export function useTheme() {
  return useContext(ThemeContext);
}

// Convenience hook to get just colors
export function useColors(): ColorTheme {
  return useContext(ThemeContext).colors;
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemColorScheme = useColorScheme();
  const themeMode = useUnfoldStore((s) => s.user?.themeMode ?? 'dark');
  const persistedAccentThemeId = useUnfoldStore((s) => s.user?.accentTheme);
  const premiumPolicy = usePremiumAccessPolicy();
  // Premium accents revert for a lapsed subscriber, mirroring the reading
  // font; 'unknown' keeps the persisted accent so hydration never flashes gold.
  const accentThemeId = resolveEffectiveAccentThemeId(persistedAccentThemeId, premiumPolicy);

  const value = useMemo(() => {
    // Determine if we should use dark mode
    let isDark: boolean;
    if (themeMode === 'system') {
      isDark = systemColorScheme !== 'light';
    } else {
      isDark = themeMode === 'dark';
    }

    const baseColors = isDark ? DarkColors : LightColors;
    const accentTheme = ACCENT_THEMES.find((t) => t.id === accentThemeId);
    const accent = accentTheme ? (isDark ? accentTheme.dark : accentTheme.light) : baseColors.accent;
    const colors = createThemedColors(baseColors, accent);

    const baseNav = isDark ? DarkNavigationTheme : LightNavigationTheme;
    const navigationTheme = {
      ...baseNav,
      colors: { ...baseNav.colors, notification: accent },
    };

    return {
      colors,
      navigationTheme,
      isDark,
      themeMode,
    };
  }, [themeMode, systemColorScheme, accentThemeId]);

  // Sync native root view background with current theme to prevent flash on theme switch
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(value.colors.background);
  }, [value.colors.background]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
