import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { requireOptionalNativeModule } from 'expo-modules-core';

import { isQaToolsEnabled } from '@/lib/qa-tools';
import { useUnfoldStore, type AccentThemeId, type ThemeMode, type UserProfile } from '@/lib/store';
import { useTheme } from '@/lib/theme';

const previewThemeModes = ['dark', 'light', 'system'] as const;
const previewAccentThemes = ['gold', 'ocean', 'rose', 'forest', 'lavender', 'ember', 'slate'] as const;

type DevMenuPreferencesModule = {
  setPreferencesAsync?: (settings: { showFloatingActionButton?: boolean }) => Promise<void>;
};

function getPreviewThemeMode(rawTheme: string | string[] | undefined): ThemeMode {
  const value = Array.isArray(rawTheme) ? rawTheme[0] : rawTheme;
  if (previewThemeModes.includes(value as ThemeMode)) return value as ThemeMode;
  return 'dark';
}

function getPreviewAccentTheme(rawAccent: string | string[] | undefined): AccentThemeId {
  const value = Array.isArray(rawAccent) ? rawAccent[0] : rawAccent;
  if (previewAccentThemes.includes(value as AccentThemeId)) return value as AccentThemeId;
  return 'gold';
}

function buildQaBibleUser(themeMode: ThemeMode, accentTheme: AccentThemeId, existing?: UserProfile | null): UserProfile {
  return {
    name: existing?.name ?? 'Nick',
    aboutMe: existing?.aboutMe ?? 'Seeded Bible-reader runtime QA profile.',
    personaTraits: existing?.personaTraits ?? ['reflective', 'building', 'hopeful'],
    currentSituation: 'Reviewing Bible highlight visual polish.',
    emotionalState: existing?.emotionalState ?? 'Hopeful',
    faithImpact: existing?.faithImpact ?? 'Wants scripture highlights to feel readable and premium.',
    spiritualSeeking: existing?.spiritualSeeking ?? 'A steady rhythm with God in the middle of work and decisions.',
    readingDuration: existing?.readingDuration ?? 5,
    devotionalLength: existing?.devotionalLength ?? 3,
    reminderTime: existing?.reminderTime ?? '08:00',
    hasCompletedOnboarding: true,
    hasCompletedStyleOnboarding: true,
    isPremium: existing?.isPremium ?? false,
    fontSize: existing?.fontSize ?? 'medium',
    writingStyle: existing?.writingStyle ?? {
      tone: 'warm',
      depth: 'balanced',
      faithBackground: 'growing',
      lifeStage: 'building',
    },
    bibleTranslation: 'BSB',
    themeMode,
    accentTheme,
    readingFont: existing?.readingFont ?? 'source-serif',
    preferredVoice: existing?.preferredVoice ?? 'alloy',
    relationshipWithGod: existing?.relationshipWithGod ?? 'ups-and-downs',
    bibleFrequency: existing?.bibleFrequency ?? 'few-times-week',
    growthGoals: existing?.growthGoals ?? ['peace', 'discernment', 'consistency'],
    obstacles: existing?.obstacles ?? ['busyness', 'uncertainty'],
    companionName: existing?.companionName ?? 'Companion',
  };
}

function hideExpoDevToolsFabForPreview() {
  if (!__DEV__) return;

  try {
    const preferences = requireOptionalNativeModule<DevMenuPreferencesModule>('DevMenuPreferences');
    void preferences?.setPreferencesAsync?.({ showFloatingActionButton: false });
  } catch {
    // The native DevMenuPreferences module only exists in dev clients.
  }
}

export default function DebugSeedBibleScreen() {
  const router = useRouter();
  const { theme, themeMode, accent, accentTheme } = useLocalSearchParams<{
    theme?: string | string[];
    themeMode?: string | string[];
    accent?: string | string[];
    accentTheme?: string | string[];
  }>();
  const previewThemeMode = getPreviewThemeMode(theme ?? themeMode);
  const previewAccentTheme = getPreviewAccentTheme(accent ?? accentTheme);
  const { colors } = useTheme();

  useEffect(() => {
    if (!isQaToolsEnabled()) return;

    hideExpoDevToolsFabForPreview();

    const nowIso = new Date().toISOString();
    const store = useUnfoldStore.getState();

    store.setUser(buildQaBibleUser(previewThemeMode, previewAccentTheme, store.user));
    store.updateBibleReaderSettings({
      translation: 'BSB',
      fontSize: 20,
      lineHeightMultiplier: 1.65,
      showVerseNumbers: true,
      paragraphMode: false,
    });

    useUnfoldStore.setState({
      bibleHighlights: [
        {
          id: `qa-bible-highlight-john-1-${previewThemeMode}`,
          bookId: 43,
          bookName: 'John',
          chapter: 1,
          verseStart: 1,
          verseEnd: 2,
          text: 'In the beginning was the Word, and the Word was with God, and the Word was God. He was with God in the beginning.',
          color: 'yellow',
          translation: 'BSB',
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ],
    });

    router.replace({
      pathname: '/(tabs)/(bible)/reader',
      params: { bookId: '43', chapter: '1', verse: '1' },
    });
  }, [previewAccentTheme, previewThemeMode, router]);

  if (!isQaToolsEnabled()) {
    return <Redirect href="/(tabs)/(bible)" />;
  }

  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator color={colors.accent} />
      <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center' }}>
        Seeding Bible highlight preview in {previewThemeMode}/{previewAccentTheme}…
      </Text>
    </View>
  );
}
