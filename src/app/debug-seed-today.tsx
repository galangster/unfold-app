import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { requireOptionalNativeModule } from 'expo-modules-core';

import { buildDevotionalSeed } from '@/lib/dev-seed';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import {
  useUnfoldStore,
  type AccentThemeId,
  type Devotional,
  type Highlight,
  type ThemeMode,
  type UserProfile,
} from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { useUIState } from '@/lib/ui-state';

const QA_TODAY_PROFILE_MARKER = 'Seeded Today-screen runtime QA profile.';
const QA_TODAY_CONTEXT_SLOT_PREFIX = 'QA Today context slot:';

const qaTodayUser: UserProfile = {
  name: 'Nick',
  aboutMe: QA_TODAY_PROFILE_MARKER,
  personaTraits: ['reflective', 'building', 'hopeful'],
  currentSituation: 'Reviewing a calmer Today tab redesign.',
  emotionalState: 'Hopeful',
  faithImpact: 'Wants scripture to feel personal, premium, and grounded.',
  spiritualSeeking: 'A steady rhythm with God in the middle of work and decisions.',
  readingDuration: 5,
  devotionalLength: 3,
  reminderTime: '08:00',
  hasCompletedOnboarding: true,
  hasCompletedStyleOnboarding: true,
  isPremium: false,
  fontSize: 'medium',
  writingStyle: {
    tone: 'warm',
    depth: 'balanced',
    faithBackground: 'growing',
    lifeStage: 'building',
  },
  bibleTranslation: 'BSB',
  themeMode: 'dark',
  accentTheme: 'gold',
  readingFont: 'source-serif',
  preferredVoice: 'alloy',
  relationshipWithGod: 'ups-and-downs',
  bibleFrequency: 'few-times-week',
  growthGoals: ['peace', 'discernment', 'consistency'],
  obstacles: ['busyness', 'uncertainty'],
  companionName: 'Companion',
};

type DevMenuPreferencesModule = {
  setPreferencesAsync?: (settings: { showFloatingActionButton?: boolean }) => Promise<void>;
};

type TodayPreviewState =
  | 'unread'
  | 'overdue'
  | 'reveal-ready'
  | 'preparing'
  | 'complete-today'
  | 'tomorrow-locked'
  | 'journey-complete'
  | 'first-time-empty'
  | 'empty'
  | 'day1-review'
  | 'resume-reading'
  | 'resume-journal'
  | 'midday'
  | 'evening'
  | 'bridge'
  | 'bridge-loading'
  | 'remember-this'
  | 'premium-nudge'
  | 'phase4-stack';

const todayPreviewStates = [
  'unread',
  'overdue',
  'reveal-ready',
  'preparing',
  'complete-today',
  'tomorrow-locked',
  'journey-complete',
  'first-time-empty',
  'empty',
  'day1-review',
  'resume-reading',
  'resume-journal',
  'midday',
  'evening',
  'bridge',
  'bridge-loading',
  'remember-this',
  'premium-nudge',
  'phase4-stack',
] as const;

const todayPreviewThemeModes = ['dark', 'light', 'system'] as const;
const todayPreviewAccentThemes = ['gold', 'ocean', 'rose', 'forest', 'lavender', 'ember', 'slate'] as const;

function getTodayPreviewState(rawState: string | string[] | undefined): TodayPreviewState {
  const value = Array.isArray(rawState) ? rawState[0] : rawState;
  if (todayPreviewStates.includes(value as TodayPreviewState)) return value as TodayPreviewState;
  return 'unread';
}

function getTodayPreviewThemeMode(rawTheme: string | string[] | undefined): ThemeMode {
  const value = Array.isArray(rawTheme) ? rawTheme[0] : rawTheme;
  if (todayPreviewThemeModes.includes(value as ThemeMode)) return value as ThemeMode;
  return 'dark';
}

function getTodayPreviewAccentTheme(rawAccent: string | string[] | undefined): AccentThemeId {
  const value = Array.isArray(rawAccent) ? rawAccent[0] : rawAccent;
  if (todayPreviewAccentThemes.includes(value as AccentThemeId)) return value as AccentThemeId;
  return 'gold';
}

function isContextSlotPreviewState(state: TodayPreviewState): boolean {
  return ['resume-reading', 'resume-journal', 'midday', 'evening', 'bridge', 'bridge-loading'].includes(state);
}

function isPremiumContextPreviewState(state: TodayPreviewState): boolean {
  return ['midday', 'evening', 'bridge', 'bridge-loading'].includes(state);
}

function buildQaTodayUser(
  state: TodayPreviewState,
  themeMode: ThemeMode = 'dark',
  accentTheme: AccentThemeId = 'gold',
): UserProfile {
  if (!isContextSlotPreviewState(state)) {
    return {
      ...qaTodayUser,
      themeMode,
      accentTheme,
    };
  }

  return {
    ...qaTodayUser,
    themeMode,
    accentTheme,
    currentSituation: `${qaTodayUser.currentSituation} ${QA_TODAY_CONTEXT_SLOT_PREFIX} ${state}.`,
  };
}

function markDayRead(day: Devotional['days'][number], readAt: string): Devotional['days'][number] {
  return {
    ...day,
    isRead: true,
    isRevealed: true,
    readAt,
    generatedAt: readAt,
    updatedAt: readAt,
  };
}

function markDayUnread(day: Devotional['days'][number], generatedAt: string): Devotional['days'][number] {
  return {
    ...day,
    isRead: false,
    isRevealed: true,
    generatedAt,
    updatedAt: generatedAt,
  };
}

function buildTodayPreviewSeed(state: TodayPreviewState): Devotional | null {
  const nowIso = new Date().toISOString();
  const seeded = buildDevotionalSeed({ nowIso });

  if (state === 'empty' || state === 'first-time-empty') {
    return null;
  }

  if (state === 'overdue') {
    const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return {
      ...seeded,
      currentDay: 1,
      days: seeded.days.map((day) => {
        if (day.dayNumber === 1) return markDayUnread(day, yesterdayIso);
        return day;
      }),
    };
  }

  if (state === 'complete-today') {
    return {
      ...seeded,
      currentDay: 1,
      days: seeded.days.map((day) => {
        if (day.dayNumber === 1) return markDayRead(day, nowIso);
        return day;
      }),
    };
  }

  if (state === 'tomorrow-locked') {
    return {
      ...seeded,
      currentDay: 2,
      days: seeded.days.map((day) => {
        if (day.dayNumber === 1) return markDayRead(day, nowIso);
        if (day.dayNumber === 2) return markDayUnread(day, nowIso);
        return day;
      }),
    };
  }

  if (state === 'resume-reading') {
    const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return {
      ...seeded,
      currentDay: 3,
      days: seeded.days.map((day) => {
        if (day.dayNumber === 1) return markDayRead(day, yesterdayIso);
        if (day.dayNumber === 2) return markDayUnread(day, yesterdayIso);
        return markDayUnread(day, nowIso);
      }),
    };
  }

  if (state === 'resume-journal') {
    const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return {
      ...seeded,
      currentDay: 2,
      days: seeded.days.map((day) => {
        if (day.dayNumber === 1) return markDayRead(day, yesterdayIso);
        if (day.dayNumber === 2) return markDayUnread(day, nowIso);
        return day;
      }),
    };
  }

  if (state === 'midday' || state === 'bridge' || state === 'bridge-loading') {
    const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return {
      ...seeded,
      currentDay: 2,
      days: seeded.days.map((day) => {
        if (day.dayNumber === 1) return markDayRead(day, yesterdayIso);
        if (day.dayNumber === 2) return markDayUnread(day, nowIso);
        return day;
      }),
    };
  }

  if (state === 'evening') {
    return {
      ...seeded,
      currentDay: 1,
      days: seeded.days.map((day) => {
        if (day.dayNumber === 1) return markDayRead(day, nowIso);
        return day;
      }),
    };
  }

  if (state === 'journey-complete' || state === 'premium-nudge') {
    return {
      ...seeded,
      currentDay: seeded.totalDays,
      days: seeded.days.map((day, index) => {
        const completedAt = new Date(Date.now() - (seeded.totalDays - index - 1) * 24 * 60 * 60 * 1000).toISOString();
        return {
          ...day,
          isRead: true,
          isRevealed: true,
          readAt: completedAt,
          generatedAt: completedAt,
          updatedAt: completedAt,
        };
      }),
    };
  }

  if (state === 'day1-review' || state === 'phase4-stack') {
    return {
      ...seeded,
      currentDay: 2,
      days: seeded.days.map((day) => {
        if (day.dayNumber === 1) {
          return {
            ...day,
            isRead: true,
            isRevealed: true,
            readAt: nowIso,
            generatedAt: nowIso,
            updatedAt: nowIso,
          };
        }

        if (day.dayNumber === 2) {
          return {
            ...day,
            isRead: false,
            isRevealed: false,
            generatedAt: nowIso,
            updatedAt: nowIso,
          };
        }

        return day;
      }),
    };
  }

  if (state === 'preparing') {
    const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    return {
      ...seeded,
      currentDay: 2,
      seriesStartDate: yesterdayIso,
      days: seeded.days
        .filter((day) => day.dayNumber === 1)
        .map((day) => ({
          ...day,
          isRead: true,
          isRevealed: true,
          readAt: yesterdayIso,
          generatedAt: yesterdayIso,
          updatedAt: yesterdayIso,
        })),
    };
  }

  if (state !== 'reveal-ready') {
    return seeded;
  }

  const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  return {
    ...seeded,
    currentDay: 2,
    days: seeded.days.map((day) => {
      if (day.dayNumber === 1) {
        return {
          ...day,
          isRead: true,
          isRevealed: true,
          readAt: yesterdayIso,
          generatedAt: yesterdayIso,
          updatedAt: yesterdayIso,
        };
      }

      if (day.dayNumber === 2) {
        return {
          ...day,
          isRead: false,
          isRevealed: false,
          generatedAt: nowIso,
          updatedAt: nowIso,
        };
      }

      return day;
    }),
  };
}

function buildRememberThisHighlight(seed: Devotional, createdAt: string): Highlight {
  const sourceDay = seed.days.find((day) => day.dayNumber === 1);

  return {
    id: `qa_today_remember_${seed.id}`,
    devotionalId: seed.id,
    devotionalTitle: seed.title,
    dayNumber: 1,
    dayTitle: sourceDay?.title || 'When the Map Dissolves',
    highlightedText: 'The next faithful step is enough for today.',
    color: 'yellow',
    contextBefore: 'You do not have to solve the whole road at once.',
    contextAfter: 'Grace meets you in the next act of trust.',
    createdAt,
    updatedAt: createdAt,
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

export default function DebugSeedTodayScreen() {
  const router = useRouter();
  const { state, theme, themeMode, accent, accentTheme } = useLocalSearchParams<{
    state?: string | string[];
    theme?: string | string[];
    themeMode?: string | string[];
    accent?: string | string[];
    accentTheme?: string | string[];
  }>();
  const previewState = getTodayPreviewState(state);
  const previewThemeMode = getTodayPreviewThemeMode(theme ?? themeMode);
  const previewAccentTheme = getTodayPreviewAccentTheme(accent ?? accentTheme);
  const { colors } = useTheme();

  useEffect(() => {
    if (!isQaToolsEnabled()) return;

    hideExpoDevToolsFabForPreview();

    const seeded = buildTodayPreviewSeed(previewState);
    const store = useUnfoldStore.getState();
    const returningMarker = buildDevotionalSeed();
    const ui = useUIState.getState();

    ui.setDebugForceTrialExpired(previewState === 'premium-nudge');
    ui.setQaPremiumOverride(isPremiumContextPreviewState(previewState));
    ui.setRevenueCatResolved();

    store.setUser(buildQaTodayUser(previewState, previewThemeMode, previewAccentTheme));
    store.removeDevotional(returningMarker.id);
    store.clearResumeContext();
    useUnfoldStore.setState({
      devotionals: [],
      currentDevotionalId: null,
      hasEverCreatedDevotional: false,
      checkIns: [],
      lastMiddayCompletedDate: null,
      lastEveningCompletedDate: null,
      nudgeImpressions: [],
      nudgeDismissals: [],
      nudgeShownThisSession: false,
      streakJustReset: false,
      streakCurrent: 1,
      streakLastReadDate: new Date().toISOString(),
      streakFreezes: 0,
      justCompletedSeriesTitle: null,
      hasUsedAudio: false,
      highlights: [],
    });

    if (seeded) {
      store.addDevotional(seeded);
      store.setCurrentDevotional(seeded.id);
    } else if (previewState === 'first-time-empty') {
      useUnfoldStore.setState({
        devotionals: [],
        currentDevotionalId: null,
        hasEverCreatedDevotional: false,
      });
    } else {
      // Make the empty-state preview deterministic while preserving the
      // returning-user branch: add/remove one QA devotional so the store knows
      // this user has created a study before, then leave Today with no active
      // devotional.
      store.addDevotional(returningMarker);
      store.setCurrentDevotional(returningMarker.id);
      store.removeDevotional(returningMarker.id);
    }

    if (seeded && previewState === 'resume-reading') {
      const resumeDay = seeded.days.find((day) => day.dayNumber === 2);
      store.setResumeContext({
        route: 'reading',
        devotionalId: seeded.id,
        dayNumber: 2,
        devotionalTitle: seeded.title,
        dayTitle: resumeDay?.title,
        touchedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      });
    }

    if (seeded && previewState === 'resume-journal') {
      const resumeDay = seeded.days.find((day) => day.dayNumber === 1);
      store.setResumeContext({
        route: 'journal',
        devotionalId: seeded.id,
        dayNumber: 1,
        devotionalTitle: seeded.title,
        dayTitle: resumeDay?.title,
        touchedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      });
    }

    if (seeded && previewState === 'premium-nudge') {
      useUnfoldStore.setState({
        justCompletedSeriesTitle: seeded.title,
        nudgeImpressions: [],
        nudgeDismissals: [],
        nudgeShownThisSession: false,
        streakJustReset: false,
      });
    }

    if (seeded && (previewState === 'remember-this' || previewState === 'phase4-stack')) {
      const createdAt = new Date().toISOString();
      useUnfoldStore.setState({
        highlights: [buildRememberThisHighlight(seeded, createdAt)],
      });
    }

    if (seeded && previewState === 'phase4-stack') {
      const resumeDay = seeded.days.find((day) => day.dayNumber === 1);
      store.setResumeContext({
        route: 'journal',
        devotionalId: seeded.id,
        dayNumber: 1,
        devotionalTitle: seeded.title,
        dayTitle: resumeDay?.title,
        touchedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      });
      useUnfoldStore.setState({
        streakJustReset: true,
        streakCurrent: 3,
        streakLastReadDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        nudgeImpressions: [],
        nudgeDismissals: [],
        nudgeShownThisSession: false,
      });
    }

    store.setHasSeenHomeTooltips(true);
    store.setHasSeenFeatureOnboarding(true);
    if (previewState === 'day1-review' || previewState === 'phase4-stack') {
      useUnfoldStore.setState({ hasSeenDay1Review: false });
    } else {
      store.setHasSeenDay1Review();
    }

    router.replace('/(tabs)/(today)');
  }, [previewState, previewThemeMode, previewAccentTheme, router]);

  if (!isQaToolsEnabled()) {
    return <Redirect href="/(tabs)/(you)" />;
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
        Seeding Today {previewState === 'reveal-ready' ? 'reveal' : previewState} preview in {previewThemeMode}/{previewAccentTheme}…
      </Text>
    </View>
  );
}
