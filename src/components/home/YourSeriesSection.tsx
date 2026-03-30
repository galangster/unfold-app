import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BookOpenIcon, CaretRightIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useUnfoldStore, type Devotional } from '@/lib/store';

function SeriesCard({
  devotional,
  colors,
  onPress,
}: {
  devotional: Devotional;
  colors: ReturnType<typeof useTheme>['colors'];
  onPress: () => void;
}) {
  const completedDays = (devotional.days ?? []).filter((d) => d.isRead).length;
  const progress = devotional.totalDays > 0 ? (completedDays / devotional.totalDays) * 100 : 0;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${devotional.title}, Day ${devotional.currentDay} of ${devotional.totalDays}`}
    >
      <View
        style={[
          styles.seriesCard,
          {
            backgroundColor: colors.inputBackground,
            borderColor: colors.border,
          },
        ]}
      >
        <Text
          style={[styles.seriesTitle, { color: colors.text }]}
          numberOfLines={1}
        >
          {devotional.title}
        </Text>

        <Text
          style={[styles.seriesDayLabel, { color: colors.textMuted }]}
        >
          Day {devotional.currentDay} of {devotional.totalDays}
        </Text>

        {/* Progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.accent,
                width: `${Math.min(progress, 100)}%`,
              },
            ]}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function YourSeriesSection() {
  const router = useRouter();
  const { colors } = useTheme();
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const setCurrentDevotional = useUnfoldStore((s) => s.setCurrentDevotional);

  if (devotionals.length === 0) return null;

  // Deduplicate by series title — keep the one with most progress (highest currentDay).
  // This prevents showing the same series twice when multiple devotionals share a title.
  const uniqueSeries = Object.values(
    devotionals.reduce<Record<string, Devotional>>((acc, d) => {
      if (!acc[d.title] || d.currentDay > acc[d.title].currentDay) {
        acc[d.title] = d;
      }
      return acc;
    }, {}),
  );

  // Sort by createdAt descending — show all unique series on home
  const recentSeries = uniqueSeries
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleSeriesPress = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentDevotional(id);
    router.push('/(tabs)/(today)/reading');
  };

  const handleSeeAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/(tabs)/(you)/past-devotionals' as any, params: { from: 'home' } });
  };

  return (
    <Animated.View
      entering={FadeIn.duration(400).delay(300)}
      style={styles.wrapper}
    >
      {/* Section header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <BookOpenIcon size={14} color={colors.textMuted} weight="light" />
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            YOUR STUDIES
          </Text>
        </View>

        {uniqueSeries.length > 4 && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleSeeAll}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="link"
            accessibilityLabel="See all studies"
          >
            <View style={styles.seeAllRow}>
              <Text style={[styles.seeAllText, { color: colors.accent }]}>
                See All
              </Text>
              <CaretRightIcon size={12} color={colors.accent} weight="bold" />
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Series cards */}
      {recentSeries.map((devotional) => (
        <SeriesCard
          key={devotional.id}
          devotional={devotional}
          colors={colors}
          onPress={() => handleSeriesPress(devotional.id)}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['5'],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing['3'],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
  },
  seriesCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: 14,
    marginBottom: Spacing['2'],
  },
  seriesTitle: {
    fontFamily: FontFamily.display,
    fontSize: 17,
    lineHeight: 22,
    marginBottom: 4,
  },
  seriesDayLabel: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
    marginBottom: 10,
  },
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
  },
});
