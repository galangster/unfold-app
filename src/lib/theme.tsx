import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  ColorTheme,
  DarkColors,
  LightColors,
  DarkNavigationTheme,
  LightNavigationTheme,
  createThemedColors,
} from '@/constants/colors';
import { useUnfoldStore, ThemeMode, ACCENT_THEMES } from '@/lib/store';

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
  const accentThemeId = useUnfoldStore((s) => s.user?.accentTheme ?? 'gold');

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

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
