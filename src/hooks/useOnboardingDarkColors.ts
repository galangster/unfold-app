import { useMemo } from 'react';
import { DarkColors, createThemedColors } from '@/constants/colors';
import { ACCENT_THEMES, useUnfoldStore } from '@/lib/store';

export function useOnboardingDarkColors() {
  const accentThemeId = useUnfoldStore((s) => s.user?.accentTheme ?? 'gold');
  return useMemo(() => {
    const accentTheme = ACCENT_THEMES.find((theme) => theme.id === accentThemeId);
    const accent = accentTheme ? accentTheme.dark : DarkColors.accent;
    return createThemedColors(DarkColors, accent);
  }, [accentThemeId]);
}
