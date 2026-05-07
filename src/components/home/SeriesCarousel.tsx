import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  FadeInRight,
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CaretRightIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration, Ease, Stagger } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, type Devotional } from '@/lib/store';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';

const CARD_WIDTH = 160;
const CARD_GAP = parseInt(String(Spacing['3']), 10) || 12;
const CARD_TOTAL = CARD_WIDTH + CARD_GAP;
const HORIZONTAL_PADDING = parseInt(String(Spacing['6']), 10) || 24;

const AnimatedFlatList = Animated.FlatList as unknown as typeof Animated.FlatList<Devotional>;

// --- Internal SeriesCard sub-component ---

function SeriesCardInner({
  devotional,
  index,
  scrollX,
  colors,
  onPress,
}: {
  devotional: Devotional;
  index: number;
  scrollX: SharedValue<number>;
  colors: ReturnType<typeof useTheme>['colors'];
  onPress: () => void;
}) {
  const { entering } = useAccessibleAnimation();

  const animatedStyle = useAnimatedStyle(() => {
    const cardCenter = HORIZONTAL_PADDING + index * CARD_TOTAL + CARD_WIDTH / 2;
    const distanceFromCenter = scrollX.value + CARD_WIDTH - cardCenter;
    const scale = interpolate(
      Math.abs(distanceFromCenter),
      [0, CARD_TOTAL * 2],
      [1, 0.97],
      Extrapolation.CLAMP,
    );
    return { transform: [{ scale }] };
  });

  return (
    <Animated.View
      entering={entering(
        FadeInRight.duration(Duration.normal).delay(Stagger.normal * index).easing(Ease.out),
      )}
      style={[{ width: CARD_WIDTH, marginRight: CARD_GAP }, animatedStyle]}
    >
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${devotional.title}, Day ${devotional.currentDay} of ${devotional.totalDays}`}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.border,
            },
          ]}
        >
          <Text
            style={[styles.cardTitle, { color: colors.text }]}
            numberOfLines={2}
          >
            {devotional.title}
          </Text>

          <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
            Day {devotional.currentDay} of {devotional.totalDays}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const SeriesCard = React.memo(SeriesCardInner);

// --- Main SeriesCarousel ---

export function SeriesCarousel() {
  const router = useRouter();
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);
  const setCurrentDevotional = useUnfoldStore((s) => s.setCurrentDevotional);

  const scrollX = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
    },
  });

  // Deduplicate by series title -- keep the one with most progress (highest currentDay)
  const uniqueSeries = Object.values(
    devotionals.reduce<Record<string, Devotional>>((acc, d) => {
      if (!acc[d.title] || d.currentDay > acc[d.title].currentDay) {
        acc[d.title] = d;
      }
      return acc;
    }, {}),
  );

  // Sort by createdAt descending, exclude current series
  const sortedSeries = uniqueSeries
    .filter((d) => d.id !== currentDevotionalId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const showSeeAll = sortedSeries.length >= 4;

  const handleSeriesPress = useCallback(
    (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentDevotional(id);
      router.push('/(tabs)/(today)/reading');
    },
    [setCurrentDevotional, router],
  );

  const handleSeeAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/(tabs)/(today)/past-devotionals' as any, params: { from: 'home' } });
  }, [router]);

  const keyExtractor = useCallback((item: Devotional) => item.id, []);

  const renderItem = useCallback(
    ({ item, index }: { item: Devotional; index: number }) => (
      <SeriesCard
        devotional={item}
        index={index}
        scrollX={scrollX}
        colors={colors}
        onPress={() => handleSeriesPress(item.id)}
      />
    ),
    [scrollX, colors, handleSeriesPress],
  );

  // Zone 5 collapses when there's 1 or fewer past series
  if (sortedSeries.length <= 1) return null;

  return (
    <Animated.View
      entering={entering(FadeIn.duration(Duration.normal).delay(320).easing(Ease.out))}
      style={styles.wrapper}
    >
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
          YOUR DEVOTIONALS
        </Text>

        {showSeeAll && (
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

      {/* Horizontal carousel */}
      <AnimatedFlatList
        data={sortedSeries}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={styles.listContent}
      />
    </Animated.View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  wrapper: {
    marginTop: Spacing['5'],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing['6'],
    marginBottom: Spacing['3'],
  },
  sectionLabel: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.sm,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
  },
  listContent: {
    paddingHorizontal: Spacing['6'],
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: 14,
  },
  cardTitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
});
