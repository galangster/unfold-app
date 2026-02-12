import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, Flame, BookOpen, Calendar, Target, Award, Sparkles } from 'lucide-react-native';
import { FontFamily } from '@/constants/fonts';
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
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const usedScriptures = useUnfoldStore((s) => s.usedScriptures);

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
      (acc, d) => acc + d.days.filter((day) => day.isRead).length,
      0
    );
    const totalJourneys = scopedDevotionals.length;
    const completedJourneys = scopedDevotionals.filter(
      (d) => d.days.length === d.totalDays && d.days.every((day) => day.isRead)
    ).length;
    const totalJournalEntries = scopedJournalEntries.length;
    const uniqueScriptures = new Set(scopedUsedScriptures.map((s) => s.reference)).size;

    // Unique themes explored
    const themes = new Set(scopedDevotionals.map((d) => d.themeCategory).filter(Boolean));
    const themesExplored = themes.size;

    // Unique devotional types
    const types = new Set(scopedDevotionals.map((d) => d.devotionalType).filter(Boolean));
    const typesExplored = types.size;

    const { currentStreak, longestStreak } = calculateStreak(scopedDevotionals);

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
    };
  }, [scopedDevotionals, scopedJournalEntries, scopedUsedScriptures]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ padding: 8 }}
            >
              <ChevronLeft size={24} color={colors.textMuted} />
            </Pressable>
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: 16,
                color: colors.text,
                marginLeft: 8,
              }}
            >
              {selectedThemeName ? `${selectedThemeName} Journey` : 'Your Journey'}
            </Text>
          </View>

          {selectedThemeId && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.replace('/(main)/stats');
              }}
              style={({ pressed }) => ({
                opacity: pressed ? 0.7 : 1,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.inputBackground,
              })}
            >
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 12,
                  color: colors.textSubtle,
                }}
              >
                All themes
              </Text>
            </Pressable>
          )}
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          {selectedThemeName && (
            <Animated.View entering={FadeInDown.duration(420)}>
              <View
                style={{
                  backgroundColor: colors.inputBackground,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  marginBottom: 14,
                }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 12,
                    color: colors.textSubtle,
                  }}
                >
                  Focused view · {selectedThemeName}
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Streak Hero */}
          <Animated.View entering={FadeInDown.duration(500)}>
            <View
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 28,
                alignItems: 'center',
                marginBottom: 24,
              }}
            >
              <Flame size={32} color={colors.accent} strokeWidth={1.5} />
              <Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: 56,
                  color: colors.text,
                  marginTop: 8,
                  letterSpacing: -2,
                }}
              >
                {stats.currentStreak}
              </Text>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 14,
                  color: colors.textMuted,
                  marginTop: -4,
                }}
              >
                {stats.currentStreak === 1 ? 'day streak' : 'day streak'}
              </Text>
              {stats.longestStreak > stats.currentStreak && (
                <Text
                  style={{
                    fontFamily: FontFamily.mono,
                    fontSize: 11,
                    color: colors.textSubtle,
                    marginTop: 12,
                    letterSpacing: 0.5,
                  }}
                >
                  Best: {stats.longestStreak} days
                </Text>
              )}
            </View>
          </Animated.View>

          {/* Stats Grid */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <Animated.View entering={FadeInDown.duration(500).delay(100)} style={{ flex: 1 }}>
              <StatCard
                icon={<Calendar size={18} color={colors.accent} strokeWidth={1.5} />}
                value={stats.totalDaysCompleted}
                label="Days completed"
                colors={colors}
              />
            </Animated.View>
            <Animated.View entering={FadeInDown.duration(500).delay(150)} style={{ flex: 1 }}>
              <StatCard
                icon={<BookOpen size={18} color={colors.accent} strokeWidth={1.5} />}
                value={stats.uniqueScriptures}
                label="Scriptures read"
                colors={colors}
              />
            </Animated.View>
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <Animated.View entering={FadeInDown.duration(500).delay(200)} style={{ flex: 1 }}>
              <StatCard
                icon={<Target size={18} color={colors.accent} strokeWidth={1.5} />}
                value={stats.completedJourneys}
                label={stats.completedJourneys === 1 ? 'Journey finished' : 'Journeys finished'}
                colors={colors}
              />
            </Animated.View>
            <Animated.View entering={FadeInDown.duration(500).delay(250)} style={{ flex: 1 }}>
              <StatCard
                icon={<Sparkles size={18} color={colors.accent} strokeWidth={1.5} />}
                value={stats.themesExplored}
                label="Themes explored"
                colors={colors}
              />
            </Animated.View>
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
            <Animated.View entering={FadeInDown.duration(500).delay(300)} style={{ flex: 1 }}>
              <StatCard
                icon={<Award size={18} color={colors.accent} strokeWidth={1.5} />}
                value={stats.totalJournalEntries}
                label={stats.totalJournalEntries === 1 ? 'Journal entry' : 'Journal entries'}
                colors={colors}
              />
            </Animated.View>
            <Animated.View entering={FadeInDown.duration(500).delay(350)} style={{ flex: 1 }}>
              <StatCard
                icon={<BookOpen size={18} color={colors.accent} strokeWidth={1.5} />}
                value={stats.totalJourneys}
                label={stats.totalJourneys === 1 ? 'Journey started' : 'Journeys started'}
                colors={colors}
              />
            </Animated.View>
          </View>

          {/* Encouraging message */}
          <Animated.View entering={FadeIn.duration(600).delay(500)}>
            <View
              style={{
                paddingVertical: 20,
                paddingHorizontal: 20,
                borderLeftWidth: 2,
                borderLeftColor: colors.accent,
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.bodyItalic,
                  fontSize: 15,
                  color: colors.textMuted,
                  lineHeight: 24,
                }}
              >
                {stats.totalDaysCompleted === 0
                  ? '"The journey of a thousand miles begins with a single step."'
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
    <View
      style={{
        backgroundColor: colors.inputBackground,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 18,
      }}
    >
      {icon}
      <Text
        style={{
          fontFamily: FontFamily.display,
          fontSize: 28,
          color: colors.text,
          marginTop: 10,
          letterSpacing: -1,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontFamily: FontFamily.ui,
          fontSize: 12,
          color: colors.textMuted,
          marginTop: 2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
