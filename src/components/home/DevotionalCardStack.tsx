/**
 * DevotionalCardStack — Swipeable horizontal card stack for multiple devotionals.
 *
 * Shows in-progress devotionals as a horizontal FlatList with:
 * - Snap-to-card behavior
 * - Peek of the next card (~8px visible)
 * - Subtle opacity on background cards
 * - Dot indicators below (state-driven, updates on snap)
 *
 * Falls back to a single DevotionalCard when there's 0 or 1 devotional.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
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
  onContinueReading: (dayNumber?: number) => void;
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

    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0.85, 1, 0.85],
      Extrapolation.CLAMP,
    );

    return {
      opacity,
    };
  });

  return (
    <Animated.View style={[{ width: cardWidth }, animatedStyle]}>
      <DevotionalCard state={item.state} scrollY={scrollY} inStack />
    </Animated.View>
  );
}

// ─── Dot indicators (state-driven) ──────────────────────────────

function DotIndicators({
  count,
  activeIndex,
}: {
  count: number;
  activeIndex: number;
}) {
  const { colors } = useTheme();

  return (
    <View style={dotStyles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            dotStyles.dot,
            {
              backgroundColor: colors.accent,
              opacity: i === activeIndex ? 1 : 0.2,
            },
          ]}
        />
      ))}
    </View>
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
    width: 7,
    height: 7,
    borderRadius: 3.5,
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
  const [activeIndex, setActiveIndex] = useState(0);

  // Card width: full screen minus padding on both sides, minus peek
  const cardWidth = screenWidth - HORIZONTAL_PADDING * 2 - PEEK_WIDTH;

  // Capture initial sort order so cards never reorder during swipes.
  const initialSortIdRef = useRef(currentDevotionalId);

  // Get in-progress devotionals (not fully completed), plus current
  const cardItems: CardItem[] = useMemo(() => {
    const todayStr = new Date().toDateString();

    function buildItem(d: Devotional): CardItem {
      const completedDays = d.days.filter((day) => day.isRead).length;
      const isComplete = completedDays >= d.totalDays;
      const progress = d.totalDays > 0 ? (completedDays / d.totalDays) * 100 : 0;

      const nextDayData = d.days.find((day) => day.dayNumber === d.currentDay) ?? null;
      const hasReadToday = d.days.some(
        (day) => day.isRead && day.readAt && new Date(day.readAt).toDateString() === todayStr,
      );

      // When today's reading is done, show the COMPLETED day (not tomorrow's).
      // This also handles the case where advanceDay() already bumped currentDay
      // but the next day hasn't been generated yet (nextDayData is null).
      let displayDayData = nextDayData;
      let navigateToDayNumber: number | undefined;

      if (hasReadToday && (!nextDayData || !nextDayData.isRead)) {
        const todayCompleted = d.days
          .filter((day) => day.isRead && day.readAt && new Date(day.readAt).toDateString() === todayStr)
          .sort((a, b) => b.dayNumber - a.dayNumber)[0];
        if (todayCompleted) {
          displayDayData = todayCompleted;
          navigateToDayNumber = todayCompleted.dayNumber;
        }
      }

      // CTA text
      const isFirstDay = d.currentDay === 1 && completedDays === 0;
      const isLastDay = d.currentDay === d.totalDays;
      let ctaText = 'Continue Reading';
      if (navigateToDayNumber) ctaText = "Today's Reading";
      else if (isFirstDay) ctaText = 'Begin Your Journey';
      else if (isLastDay && !isComplete) ctaText = 'Finish Your Series';

      // Per-card onContinue: set correct devotional BEFORE navigating
      const onContinue = () => {
        setCurrentDevotional(d.id);
        onContinueReading(navigateToDayNumber);
      };

      const state = computeDevotionalState({
        currentDevotional: d,
        currentDayData: displayDayData,
        hasReadToday,
        isJourneyComplete: isComplete,
        isPreparing: !hasReadToday && !displayDayData,
        daysCompleted: completedDays,
        totalDays: d.totalDays,
        progress,
        tomorrowTeaser: null,
        onContinue,
        onCreateNew,
        ctaText,
      });

      return { devotional: d, state };
    }

    // Filter to in-progress (or unstarted) devotionals
    const inProgress = devotionals.filter((d) => {
      const completedDays = d.days.filter((day) => day.isRead).length;
      return completedDays < d.totalDays;
    });

    if (inProgress.length === 0) {
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
            onContinue: () => onContinueReading(),
            onCreateNew,
            ctaText: 'Begin Your Journey',
          }),
        }];
      }
      return [buildItem(current)];
    }

    // Stable sort: use the INITIAL currentDevotionalId (captured at mount),
    // then by creation date. This prevents cards reordering during swipes.
    const sortId = initialSortIdRef.current;
    const sorted = [...inProgress].sort((a, b) => {
      if (a.id === sortId) return -1;
      if (b.id === sortId) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return sorted.map(buildItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devotionals, onCreateNew, onContinueReading, setCurrentDevotional]);

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

  // State setters are stable references — safe to use in stale closure
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        const newIndex = viewableItems[0].index;
        setActiveIndex(newIndex);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    <View style={{ marginTop: Spacing['5'] }}>
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
      <DotIndicators count={cardItems.length} activeIndex={activeIndex} />
    </View>
  );
}
