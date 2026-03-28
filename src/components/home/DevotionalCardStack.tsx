/**
 * DevotionalCardStack — Swipeable horizontal card stack for multiple devotionals.
 *
 * Shows in-progress devotionals as a horizontal FlatList with:
 * - Snap-to-card behavior
 * - Peek of the next card (~8px visible)
 * - Slight scale + shadow depth on background cards
 * - Dot indicators below
 * - Updates currentDevotionalId on swipe
 *
 * Falls back to a single DevotionalCard when there's 0 or 1 devotional.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  useWindowDimensions,
  StyleSheet,
  type ViewToken,
  type ListRenderItemInfo,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, type Devotional } from '@/lib/store';
import { computeDevotionalState, type DevotionalCardState } from './compute-devotional-state';
import { DevotionalCard } from './DevotionalCard';

// ─── Types ──────────────────────────────────────────────────────

interface DevotionalCardStackProps {
  scrollY: SharedValue<number>;
  onCreateNew: () => void;
  onContinueReading: () => void;
}

interface CardItem {
  devotional: Devotional;
  state: DevotionalCardState;
}

// ─── Animated card wrapper ──────────────────────────────────────

const HORIZONTAL_PADDING = Spacing['6']; // 24
const CARD_GAP = Spacing['3']; // 12
const PEEK_WIDTH = 8;

function AnimatedCardWrapper({
  item,
  index,
  scrollX,
  cardWidth,
  scrollY,
}: {
  item: CardItem;
  index: number;
  scrollX: SharedValue<number>;
  cardWidth: number;
  scrollY: SharedValue<number>;
}) {
  const totalCardWidth = cardWidth + CARD_GAP;

  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * totalCardWidth,
      index * totalCardWidth,
      (index + 1) * totalCardWidth,
    ];

    const scale = interpolate(
      scrollX.value,
      inputRange,
      [0.95, 1, 0.95],
      Extrapolation.CLAMP,
    );

    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0.7, 1, 0.7],
      Extrapolation.CLAMP,
    );

    return {
      transform: [{ scale }],
      opacity,
    };
  });

  return (
    <Animated.View style={[{ width: cardWidth }, animatedStyle]}>
      <DevotionalCard state={item.state} scrollY={scrollY} inStack />
    </Animated.View>
  );
}

// ─── Dot indicators ─────────────────────────────────────────────

function DotIndicators({
  count,
  scrollX,
  cardWidth,
}: {
  count: number;
  scrollX: SharedValue<number>;
  cardWidth: number;
}) {
  const { colors } = useTheme();
  const totalCardWidth = cardWidth + CARD_GAP;

  return (
    <View style={dotStyles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <DotItem
          key={i}
          index={i}
          scrollX={scrollX}
          totalCardWidth={totalCardWidth}
          activeColor={colors.accent}
          inactiveColor={colors.textHint ?? colors.textSubtle}
        />
      ))}
    </View>
  );
}

function DotItem({
  index,
  scrollX,
  totalCardWidth,
  activeColor,
  inactiveColor,
}: {
  index: number;
  scrollX: SharedValue<number>;
  totalCardWidth: number;
  activeColor: string;
  inactiveColor: string;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * totalCardWidth,
      index * totalCardWidth,
      (index + 1) * totalCardWidth,
    ];

    const width = interpolate(
      scrollX.value,
      inputRange,
      [6, 18, 6],
      Extrapolation.CLAMP,
    );

    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0.3, 1, 0.3],
      Extrapolation.CLAMP,
    );

    return { width, opacity };
  });

  return (
    <Animated.View
      style={[
        dotStyles.dot,
        { backgroundColor: activeColor },
        animatedStyle,
      ]}
    />
  );
}

const dotStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing['3'],
    paddingHorizontal: Spacing['6'],
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});

// ─── Main component ─────────────────────────────────────────────

const AnimatedFlatList = Animated.FlatList as unknown as typeof Animated.FlatList<CardItem>;

export function DevotionalCardStack({
  scrollY,
  onCreateNew,
  onContinueReading,
}: DevotionalCardStackProps) {
  const { width: screenWidth } = useWindowDimensions();
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);
  const setCurrentDevotional = useUnfoldStore((s) => s.setCurrentDevotional);

  const scrollX = useSharedValue(0);
  const activeIndexRef = useRef(0);

  // Card width: full screen minus padding on both sides, minus peek
  const cardWidth = screenWidth - HORIZONTAL_PADDING * 2 - PEEK_WIDTH;

  // Get in-progress devotionals (not fully completed), plus current
  const cardItems: CardItem[] = useMemo(() => {
    // Filter to in-progress (or unstarted) devotionals
    const inProgress = devotionals.filter((d) => {
      const completedDays = d.days.filter((day) => day.isRead).length;
      return completedDays < d.totalDays;
    });

    if (inProgress.length === 0) {
      // No in-progress devotionals — show the current one (which may be complete)
      // or empty state
      const current = devotionals.find((d) => d.id === currentDevotionalId);
      if (!current) {
        return [{
          devotional: null as any,
          state: computeDevotionalState({
            currentDevotional: null,
            currentDayData: null,
            hasReadToday: false,
            isJourneyComplete: false,
            isPreparing: false,
            daysCompleted: 0,
            totalDays: 0,
            progress: 0,
            tomorrowTeaser: null,
            onContinue: onContinueReading,
            onCreateNew,
            ctaText: 'Begin Your Journey',
          }),
        }];
      }
      return [buildCardItem(current)];
    }

    // Sort: current devotional first, then by most recently created
    const sorted = [...inProgress].sort((a, b) => {
      if (a.id === currentDevotionalId) return -1;
      if (b.id === currentDevotionalId) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return sorted.map(buildCardItem);
  }, [devotionals, currentDevotionalId, onCreateNew, onContinueReading]);

  function buildCardItem(d: Devotional): CardItem {
    const completedDays = d.days.filter((day) => day.isRead).length;
    const isComplete = completedDays >= d.totalDays;
    const progress = d.totalDays > 0 ? (completedDays / d.totalDays) * 100 : 0;

    const currentDayData = d.days.find((day) => day.dayNumber === d.currentDay) ?? null;
    const hasReadToday = d.days.some(
      (day) => day.isRead && day.readAt && new Date(day.readAt).toDateString() === new Date().toDateString(),
    );

    // Tomorrow teaser
    let tomorrowTeaser: string | null = null;
    const isTomorrow = !isComplete && hasReadToday;
    if (isTomorrow && currentDayData?.bodyText) {
      const stripped = currentDayData.bodyText
        .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
        .replace(/^---$/gm, '')
        .trim();
      const firstSentence = stripped.match(/^.+?[.!?]/s);
      tomorrowTeaser = firstSentence ? firstSentence[0].trim() : stripped.slice(0, 130) + '\u2026';
    }

    // CTA text
    const isFirstDay = d.currentDay === 1 && completedDays === 0;
    const isLastDay = d.currentDay === d.totalDays;
    let ctaText = 'Continue Reading';
    if (isFirstDay) ctaText = 'Begin Your Journey';
    else if (isLastDay && !isComplete) ctaText = 'Finish Your Series';

    const state = computeDevotionalState({
      currentDevotional: d,
      currentDayData,
      hasReadToday,
      isJourneyComplete: isComplete,
      isPreparing: !hasReadToday && !currentDayData,
      daysCompleted: completedDays,
      totalDays: d.totalDays,
      progress,
      tomorrowTeaser,
      onContinue: onContinueReading,
      onCreateNew,
      ctaText,
    });

    return { devotional: d, state };
  }

  // If only 1 card, render directly (no stack)
  if (cardItems.length <= 1) {
    return (
      <View>
        <DevotionalCard state={cardItems[0]?.state ?? { type: 'empty', onCreateNew }} scrollY={scrollY} />
      </View>
    );
  }

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        const newIndex = viewableItems[0].index;
        if (newIndex !== activeIndexRef.current) {
          activeIndexRef.current = newIndex;
          const item = cardItems[newIndex];
          if (item?.devotional?.id && item.devotional.id !== currentDevotionalId) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setCurrentDevotional(item.devotional.id);
          }
        }
      }
    },
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
  }).current;

  const keyExtractor = useCallback((item: CardItem) => {
    return item.devotional?.id ?? 'empty';
  }, []);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<CardItem>) => (
      <AnimatedCardWrapper
        item={item}
        index={index}
        scrollX={scrollX}
        cardWidth={cardWidth}
        scrollY={scrollY}
      />
    ),
    [scrollX, cardWidth, scrollY],
  );

  const snapOffsets = useMemo(() => {
    return cardItems.map((_, i) => i * (cardWidth + CARD_GAP));
  }, [cardItems.length, cardWidth]);

  return (
    <View>
      <AnimatedFlatList
        data={cardItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        snapToOffsets={snapOffsets}
        decelerationRate="fast"
        contentContainerStyle={{
          paddingLeft: HORIZONTAL_PADDING,
          paddingRight: HORIZONTAL_PADDING - PEEK_WIDTH,
        }}
        ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />
      <DotIndicators count={cardItems.length} scrollX={scrollX} cardWidth={cardWidth} />
    </View>
  );
}
