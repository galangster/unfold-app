import { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { CaretLeftIcon, SunIcon, BookOpenIcon, CalendarIcon, CrosshairIcon, TrophyIcon, SparkleIcon, CompassIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { BIBLE_STUDY_METHODS } from '@/constants/bible-study-methods';
import { THEME_CATEGORIES, type ThemeCategory } from '@/constants/devotional-types';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';

function calculateStreak(devotionals: { days: { isRead: boolean; readAt?: string }[] }[]): {
  currentStreak: number;
  longestStreak: number;
} {
  // Collect all read dates
  const readDates = new Set<string>();
  for (const dev of devotionals) {
    for (const day of dev.days) {
      if (day.isRead && day.readAt) {
        const date = new Date(day.readAt);
        readDates.add(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
      }
    }
  }

  if (readDates.size === 0) return { currentStreak: 0, longestStreak: 0 };

  // Check current streak (counting back from today)
  let currentStreak = 0;
  const today = new Date();
  const checkDate = new Date(today);

  // Check if today has a read
  const todayKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
  if (readDates.has(todayKey)) {
    currentStreak = 1;
    checkDate.setDate(checkDate.getDate() - 1);
  } else {
    // Check yesterday (give grace for today not yet read)
    checkDate.setDate(checkDate.getDate() - 1);
    const yesterdayKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
    if (readDates.has(yesterdayKey)) {
      currentStreak = 1;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      return { currentStreak: 0, longestStreak: calculateLongest(readDates) };
    }
  }

  // Count backwards
  while (true) {
    const key = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
    if (readDates.has(key)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return { currentStreak, longestStreak: Math.max(currentStreak, calculateLongest(readDates)) };
}

function calculateLongest(readDates: Set<string>): number {
  if (readDates.size === 0) return 0;

  // Convert to sorted date objects
  const dates = Array.from(readDates)
    .map((d) => {
      const [y, m, day] = d.split('-').map(Number);
      return new Date(y, m, day);
    })
    .sort((a, b) => a.getTime() - b.getTime());

  let longest = 1;
  let current = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24);
    if (Math.round(diff) === 1) {
      current++;
      longest = Math.max(longest, current);
    } else if (Math.round(diff) > 1) {
      current = 1;
    }
  }
  return longest;
}

export default function StatsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ theme?: string | string[] }>();
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const usedScriptures = useUnfoldStore((s) => s.usedScriptures);
  const storeStreakCurrent = useUnfoldStore((s) => s.streakCurrent);
  const storeStreakLongest = useUnfoldStore((s) => s.streakLongest);
  const methodUsageHistory = useUnfoldStore((s) => s.methodUsageHistory);

  const selectedThemeParam = Array.isArray(params.theme) ? params.theme[0] : params.theme;
  const selectedThemeId = useMemo<ThemeCategory | null>(() => {
    if (!selectedThemeParam) return null;
    return THEME_CATEGORIES.some((theme) => theme.id === selectedThemeParam)
      ? (selectedThemeParam as ThemeCategory)
      : null;
  }, [selectedThemeParam]);

  const selectedThemeName = useMemo(() => {
    if (!selectedThemeId) return null;
    return THEME_CATEGORIES.find((theme) => theme.id === selectedThemeId)?.name ?? selectedThemeId;
  }, [selectedThemeId]);

  const scopedDevotionals = useMemo(
    () => (selectedThemeId
      ? devotionals.filter((devotional) => devotional.themeCategory === selectedThemeId)
      : devotionals),
    [devotionals, selectedThemeId]
  );

  const scopedDevotionalIds = useMemo(
    () => new Set(scopedDevotionals.map((devotional) => devotional.id)),
    [scopedDevotionals]
  );

  const scopedJournalEntries = useMemo(
    () => (selectedThemeId
      ? journalEntries.filter((entry) => scopedDevotionalIds.has(entry.devotionalId))
      : journalEntries),
    [journalEntries, scopedDevotionalIds, selectedThemeId]
  );

  const scopedUsedScriptures = useMemo(
    () => (selectedThemeId
      ? usedScriptures.filter((scripture) => scopedDevotionalIds.has(scripture.devotionalId))
      : usedScriptures),
    [usedScriptures, scopedDevotionalIds, selectedThemeId]
  );

  const stats = useMemo(() => {
    const totalDaysCompleted = scopedDevotionals.reduce(
      (acc, d) => acc + (d.days ?? []).filter((day) => day.isRead).length,
      0
    );
    const totalJourneys = scopedDevotionals.length;
    const completedJourneys = scopedDevotionals.filter(
      (d) => (d.days ?? []).length === d.totalDays && (d.days ?? []).every((day) => day.isRead)
    ).length;
    const totalJournalEntries = scopedJournalEntries.length;
    const uniqueScriptures = new Set(scopedUsedScriptures.map((s) => s.reference)).size;

    // Unique themes explored
    const themes = new Set(scopedDevotionals.map((d) => d.themeCategory).filter(Boolean));
    const themesExplored = themes.size;

    // Unique devotional types
    const types = new Set(scopedDevotionals.map((d) => d.devotionalType).filter(Boolean));
    const typesExplored = types.size;

    // Method usage stats (scoped by theme if filtered)
    const scopedMethodUsage = selectedThemeId
      ? methodUsageHistory.filter((r) => scopedDevotionalIds.has(r.devotionalId))
      : methodUsageHistory;
    const uniqueMethodsUsed = new Set(scopedMethodUsage.map((r) => r.methodId)).size;

    // Most-used method
    const methodCounts = new Map<string, number>();
    for (const r of scopedMethodUsage) {
      methodCounts.set(r.methodId, (methodCounts.get(r.methodId) ?? 0) + 1);
    }
    let favoriteMethodId: string | null = null;
    let favoriteMethodCount = 0;
    for (const [id, count] of methodCounts) {
      if (count > favoriteMethodCount) {
        favoriteMethodId = id;
        favoriteMethodCount = count;
      }
    }
    const favoriteMethodName = favoriteMethodId
      ? BIBLE_STUDY_METHODS[favoriteMethodId]?.name ?? null
      : null;

    // Use store's authoritative streak for unfiltered view; recalculate only when theme-filtered
    const { currentStreak, longestStreak } = selectedThemeId
      ? calculateStreak(scopedDevotionals)
      : { currentStreak: storeStreakCurrent, longestStreak: storeStreakLongest };

    return {
      currentStreak,
      longestStreak,
      totalDaysCompleted,
      totalJourneys,
      completedJourneys,
      totalJournalEntries,
      uniqueScriptures,
      themesExplored,
      typesExplored,
      uniqueMethodsUsed,
      favoriteMethodName,
    };
  }, [scopedDevotionals, scopedJournalEntries, scopedUsedScriptures, scopedDevotionalIds, selectedThemeId, storeStreakCurrent, storeStreakLongest, methodUsageHistory]);

  return (
    <View style={[statStyles.flex1, { backgroundColor: colors.background }]}>
      <SafeAreaView style={statStyles.flex1} edges={['top']}>
        {/* Header */}
        <View style={statStyles.header}>
          <View style={statStyles.headerLeft}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={statStyles.backButton}
            >
              <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
            </TouchableOpacity>
            <Text style={[statStyles.headerTitle, { color: colors.text }]}>
              {selectedThemeName ? `${selectedThemeName} Stats` : 'Your Stats'}
            </Text>
          </View>

          {selectedThemeId && (
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.replace('/(tabs)/(you)/stats');
              }}
              style={[statStyles.allThemesButton, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}
            >
              <Text style={[statStyles.allThemesText, { color: colors.textSubtle }]}>
                All themes
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          contentContainerStyle={statStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {selectedThemeName && (
            <Animated.View entering={entering(FadeInDown.duration(Duration.normal).easing(Ease.out))}>
              <View style={[statStyles.focusedBanner, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
                <Text style={[statStyles.focusedBannerText, { color: colors.textSubtle }]}>
                  Focused view · {selectedThemeName}
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Streak Hero */}
          <Animated.View entering={entering(FadeInDown.duration(Duration.normal).easing(Ease.out))}>
            <View style={[statStyles.streakHero, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
              <SunIcon size={32} color={colors.accent} weight="light" />
              <Text style={[statStyles.streakNumber, { color: colors.text }]}>
                {stats.currentStreak}
              </Text>
              <Text style={[statStyles.streakLabel, { color: colors.textMuted }]}>
                day streak
              </Text>
              {stats.longestStreak > stats.currentStreak && (
                <Text style={[statStyles.bestStreak, { color: colors.textSubtle }]}>
                  Best: {stats.longestStreak} days
                </Text>
              )}
            </View>
          </Animated.View>

          {/* Stats Grid */}
          <View style={statStyles.gridRow}>
            <Animated.View entering={entering(FadeInDown.duration(Duration.normal).delay(100).easing(Ease.out))} style={statStyles.flex1}>
              <StatCard
                icon={<CalendarIcon size={18} color={colors.accent} weight="light" />}
                value={stats.totalDaysCompleted}
                label="Days completed"
                colors={colors}
              />
            </Animated.View>
            <Animated.View entering={entering(FadeInDown.duration(Duration.normal).delay(150).easing(Ease.out))} style={statStyles.flex1}>
              <StatCard
                icon={<BookOpenIcon size={18} color={colors.accent} weight="light" />}
                value={stats.uniqueScriptures}
                label="Scriptures read"
                colors={colors}
              />
            </Animated.View>
          </View>

          <View style={statStyles.gridRow}>
            <Animated.View entering={entering(FadeInDown.duration(Duration.normal).delay(200).easing(Ease.out))} style={statStyles.flex1}>
              <StatCard
                icon={<CrosshairIcon size={18} color={colors.accent} weight="light" />}
                value={stats.completedJourneys}
                label={stats.completedJourneys === 1 ? 'Series finished' : 'Series finished'}
                colors={colors}
              />
            </Animated.View>
            <Animated.View entering={entering(FadeInDown.duration(Duration.normal).delay(250).easing(Ease.out))} style={statStyles.flex1}>
              <StatCard
                icon={<SparkleIcon size={18} color={colors.accent} weight="light" />}
                value={stats.themesExplored}
                label="Themes explored"
                colors={colors}
              />
            </Animated.View>
          </View>

          <View style={statStyles.gridRow}>
            <Animated.View entering={entering(FadeInDown.duration(Duration.normal).delay(300).easing(Ease.out))} style={statStyles.flex1}>
              <StatCard
                icon={<TrophyIcon size={18} color={colors.accent} weight="light" />}
                value={stats.totalJournalEntries}
                label={stats.totalJournalEntries === 1 ? 'Journal entry' : 'Journal entries'}
                colors={colors}
              />
            </Animated.View>
            <Animated.View entering={entering(FadeInDown.duration(Duration.normal).delay(350).easing(Ease.out))} style={statStyles.flex1}>
              <StatCard
                icon={<BookOpenIcon size={18} color={colors.accent} weight="light" />}
                value={stats.totalJourneys}
                label={stats.totalJourneys === 1 ? 'Series started' : 'Series started'}
                colors={colors}
              />
            </Animated.View>
          </View>

          {/* Method variety row */}
          {stats.uniqueMethodsUsed > 0 && (
            <View style={statStyles.gridRow}>
              <Animated.View entering={entering(FadeInDown.duration(Duration.normal).delay(400).easing(Ease.out))} style={statStyles.flex1}>
                <StatCard
                  icon={<CompassIcon size={18} color={colors.accent} weight="light" />}
                  value={stats.uniqueMethodsUsed}
                  label={stats.uniqueMethodsUsed === 1 ? 'Study method' : 'Study methods'}
                  colors={colors}
                />
              </Animated.View>
              <Animated.View entering={entering(FadeInDown.duration(Duration.normal).delay(450).easing(Ease.out))} style={statStyles.flex1}>
                {stats.favoriteMethodName ? (
                  <View style={[statStyles.favoriteMethodCard, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
                    <CompassIcon size={18} color={colors.accent} weight="light" />
                    <Text style={[statStyles.favoriteMethodName, { color: colors.text }]} numberOfLines={2}>
                      {stats.favoriteMethodName}
                    </Text>
                    <Text style={[statStyles.favoriteMethodLabel, { color: colors.textMuted }]}>
                      Most used
                    </Text>
                  </View>
                ) : (
                  <View style={statStyles.flex1} />
                )}
              </Animated.View>
            </View>
          )}

          <View style={statStyles.spacer} />

          {/* Encouraging message */}
          <Animated.View entering={entering(FadeIn.duration(Duration.normal).delay(500).easing(Ease.out))}>
            <View style={[statStyles.quoteBlock, { borderLeftColor: colors.accent }]}>
              <Text style={[statStyles.quoteText, { color: colors.textMuted }]}>
                {stats.totalDaysCompleted === 0
                  ? '"The path of a thousand miles begins with a single step."'
                  : stats.currentStreak >= 7
                    ? '"Blessed is the one who perseveres under trial."  — James 1:12'
                    : '"His mercies are new every morning."  — Lamentations 3:23'}
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function StatCard({
  icon,
  value,
  label,
  colors,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  colors: { inputBackground: string; border: string; text: string; textMuted: string };
}) {
  return (
    <View style={[statStyles.statCard, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
      {icon}
      <Text style={[statStyles.statCardValue, { color: colors.text }]}>
        {value}
      </Text>
      <Text style={[statStyles.statCardLabel, { color: colors.textMuted }]}>
        {label}
      </Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    padding: Spacing['2'],
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.base,
    marginLeft: Spacing['2'],
  },
  allThemesButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  allThemesText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  scrollContent: {
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['4'],
    paddingBottom: 100,
  },
  focusedBanner: {
    borderRadius: Radius.card,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  focusedBannerText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  streakHero: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing['7'],
    alignItems: 'center',
    marginBottom: Spacing['6'],
  },
  streakNumber: {
    fontFamily: FontFamily.display,
    fontSize: 56,
    marginTop: Spacing['2'],
    letterSpacing: -2,
  },
  streakLabel: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
    marginTop: -4,
  },
  bestStreak: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    marginTop: Spacing['3'],
    letterSpacing: 0.5,
  },
  gridRow: {
    flexDirection: 'row',
    gap: Spacing['3'],
    marginBottom: Spacing['3'],
  },
  favoriteMethodCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 18,
    justifyContent: 'center',
  },
  favoriteMethodName: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
    marginTop: Spacing['2'],
  },
  favoriteMethodLabel: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  spacer: {
    height: Spacing['3'],
  },
  quoteBlock: {
    paddingVertical: Spacing['5'],
    paddingHorizontal: Spacing['5'],
    borderLeftWidth: 2,
  },
  quoteText: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 15,
    lineHeight: 24,
  },
  statCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 18,
  },
  statCardValue: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    marginTop: Spacing['2'],
    letterSpacing: -1,
  },
  statCardLabel: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
});
