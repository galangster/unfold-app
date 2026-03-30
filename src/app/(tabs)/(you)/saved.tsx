import { useRef, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Duration } from '@/constants/animations';
import * as Haptics from 'expo-haptics';
import {
  CaretLeftIcon,
  CaretRightIcon,
  HighlighterIcon,
  BookmarkSimpleIcon,
  BookOpenIcon,
} from 'phosphor-react-native';
import { useCrossTabBack } from '@/hooks/useCrossTabBack';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, HighlightColor } from '@/lib/store';

const HIGHLIGHT_COLORS: Record<HighlightColor, { label: string; light: string; dark: string }> = {
  yellow: { label: 'General', light: '#FFDC64', dark: '#C8A55C' },
  green: { label: 'Growth', light: '#64C864', dark: '#6DAF7B' },
  blue: { label: 'Prayer', light: '#6496FF', dark: '#5B9BD5' },
  purple: { label: 'Questions', light: '#B464C8', dark: '#9B8EC4' },
  red: { label: 'Important', light: '#FF6464', dark: '#D4828F' },
};

export default function SavedScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { handleBack } = useCrossTabBack();
  const highlights = useUnfoldStore((s) => s.highlights);
  const bookmarks = useUnfoldStore((s) => s.bookmarks);
  const devotionals = useUnfoldStore((s) => s.devotionals);

  const hasAnimated = useRef(false);

  useEffect(() => {
    hasAnimated.current = true;
  }, []);

  // Most recent 3 highlights
  const recentHighlights = useMemo(() => {
    return [...highlights]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3);
  }, [highlights]);

  // Most recent 2 bookmarks
  const recentBookmarks = useMemo(() => {
    return [...bookmarks]
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
      .slice(0, 2);
  }, [bookmarks]);

  // Completed series (all days read)
  const completedSeries = useMemo(() => {
    return devotionals
      .filter((d) => (d.days ?? []).filter((day) => day.isRead).length >= d.totalDays && d.totalDays > 0)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 2);
  }, [devotionals]);

  const handleJumpToSource = (devotionalId: string, dayNumber: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const setCurrentDevotional = useUnfoldStore.getState().setCurrentDevotional;
    setCurrentDevotional(devotionalId);
    router.push({
      pathname: '/(tabs)/(today)/reading',
      params: { day: dayNumber.toString() },
    });
  };

  const handleSelectDevotional = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const setCurrentDevotional = useUnfoldStore.getState().setCurrentDevotional;
    setCurrentDevotional(id);
    router.push('/(tabs)/(today)/reading');
  };

  // Track the running item index across sections for staggered animation
  let globalIndex = 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing['4'],
            paddingVertical: Spacing['3'],
          }}
        >
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ padding: Spacing['2'] }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
          </TouchableOpacity>
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: FontSize.base,
              color: colors.text,
              marginLeft: Spacing['2'],
            }}
          >
            Your Library
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: Spacing['6'],
            paddingTop: Spacing['2'],
            paddingBottom: insets.bottom + 100,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* ---- HIGHLIGHTS SECTION ---- */}
          <SectionHeader
            label="HIGHLIGHTS"
            colors={colors}
            hasAnimated={hasAnimated}
            index={globalIndex++}
          />

          {recentHighlights.length === 0 ? (
            <EmptyState
              icon={<HighlighterIcon size={28} color={colors.textHint} weight="light" />}
              title="Your highlights will appear here."
              subtitle="Try long-pressing any passage while reading to highlight it."
              colors={colors}
              hasAnimated={hasAnimated}
              index={globalIndex++}
            />
          ) : (
            <>
              {recentHighlights.map((highlight) => {
                const itemIndex = globalIndex++;
                return (
                  <Animated.View
                    key={highlight.id}
                    entering={
                      hasAnimated.current
                        ? undefined
                        : FadeIn.delay(itemIndex * 30).duration(Duration.slow)
                    }
                  >
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() =>
                        handleJumpToSource(highlight.devotionalId, highlight.dayNumber)
                      }
                      accessibilityLabel={`Highlight: ${highlight.highlightedText}`}
                      accessibilityRole="button"
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          backgroundColor: colors.inputBackground,
                          borderRadius: Radius.card,
                          marginBottom: 10,
                          overflow: 'hidden',
                        }}
                      >
                        {/* Color bar */}
                        <View
                          style={{
                            width: 4,
                            backgroundColor:
                              HIGHLIGHT_COLORS[highlight.color || 'yellow'][
                                isDark ? 'dark' : 'light'
                              ],
                          }}
                        />
                        <View style={{ flex: 1, padding: Spacing['4'] }}>
                          <Text
                            style={{
                              fontFamily: FontFamily.displayItalic,
                              fontSize: 15,
                              color: colors.text,
                              lineHeight: 22,
                              marginBottom: Spacing['2'],
                            }}
                            numberOfLines={3}
                          >
                            "{highlight.highlightedText}"
                          </Text>
                          <Text
                            style={{
                              fontFamily: FontFamily.ui,
                              fontSize: FontSize.xs,
                              color: colors.textSubtle,
                            }}
                            numberOfLines={1}
                          >
                            From Day {highlight.dayNumber} · {highlight.devotionalTitle}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </>
          )}

          {highlights.length > 0 && (
            <SeeAllLink
              label="See All"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(tabs)/(today)/highlights');
              }}
              colors={colors}
              hasAnimated={hasAnimated}
              index={globalIndex++}
            />
          )}

          {/* ---- BOOKMARKED PASSAGES SECTION ---- */}
          <SectionHeader
            label="BOOKMARKED PASSAGES"
            colors={colors}
            hasAnimated={hasAnimated}
            index={globalIndex++}
            style={{ marginTop: 28 }}
          />

          {recentBookmarks.length === 0 ? (
            <EmptyState
              icon={<BookmarkSimpleIcon size={28} color={colors.textHint} weight="light" />}
              title="Passages that move you, saved for later."
              subtitle="Tap the heart icon on any scripture block to bookmark it."
              colors={colors}
              hasAnimated={hasAnimated}
              index={globalIndex++}
            />
          ) : (
            <>
              {recentBookmarks.map((bookmark) => {
                const itemIndex = globalIndex++;
                return (
                  <Animated.View
                    key={bookmark.id}
                    entering={
                      hasAnimated.current
                        ? undefined
                        : FadeIn.delay(itemIndex * 30).duration(Duration.slow)
                    }
                  >
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() =>
                        handleJumpToSource(bookmark.devotionalId, bookmark.dayNumber)
                      }
                      accessibilityLabel={`Bookmark: ${bookmark.scriptureReference}`}
                      accessibilityRole="button"
                    >
                      <View
                        style={{
                          backgroundColor: colors.inputBackground,
                          borderRadius: Radius.card,
                          padding: Spacing['4'],
                          marginBottom: 10,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: FontFamily.display,
                            fontSize: FontSize.lg,
                            color: colors.text,
                            marginBottom: 6,
                          }}
                        >
                          {bookmark.scriptureReference}
                        </Text>
                        <Text
                          style={{
                            fontFamily: FontFamily.body,
                            fontSize: FontSize.sm,
                            color: colors.textMuted,
                            lineHeight: 20,
                            marginBottom: Spacing['2'],
                          }}
                          numberOfLines={2}
                        >
                          {bookmark.scriptureText}
                        </Text>
                        <Text
                          style={{
                            fontFamily: FontFamily.ui,
                            fontSize: FontSize.xs,
                            color: colors.textSubtle,
                          }}
                          numberOfLines={1}
                        >
                          {bookmark.dayTitle} · {bookmark.devotionalTitle}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </>
          )}

          {bookmarks.length > 0 && (
            <SeeAllLink
              label="See All"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(tabs)/(you)/saved-passages');
              }}
              colors={colors}
              hasAnimated={hasAnimated}
              index={globalIndex++}
            />
          )}

          {/* ---- COMPLETED SERIES SECTION ---- */}
          <SectionHeader
            label="COMPLETED SERIES"
            colors={colors}
            hasAnimated={hasAnimated}
            index={globalIndex++}
            style={{ marginTop: 28 }}
          />

          {completedSeries.length === 0 ? (
            <EmptyState
              icon={<BookOpenIcon size={28} color={colors.textHint} weight="light" />}
              title="Your completed devotionals will live here."
              subtitle="Finish your first series to see it appear."
              colors={colors}
              hasAnimated={hasAnimated}
              index={globalIndex++}
            />
          ) : (
            <>
              {completedSeries.map((devotional) => {
                const itemIndex = globalIndex++;
                const completedDays = devotional.days.filter((d) => d.isRead).length;
                const progress = (completedDays / devotional.totalDays) * 100;

                return (
                  <Animated.View
                    key={devotional.id}
                    entering={
                      hasAnimated.current
                        ? undefined
                        : FadeIn.delay(itemIndex * 30).duration(Duration.slow)
                    }
                  >
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => handleSelectDevotional(devotional.id)}
                      accessibilityLabel={`Completed series: ${devotional.title}`}
                      accessibilityRole="button"
                    >
                      <View
                        style={{
                          backgroundColor: colors.inputBackground,
                          borderRadius: Radius.card,
                          padding: Spacing['4'],
                          marginBottom: 10,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: FontFamily.display,
                            fontSize: FontSize.lg,
                            color: colors.text,
                            lineHeight: 24,
                            marginBottom: 10,
                          }}
                        >
                          {devotional.title}
                        </Text>

                        {/* Progress bar */}
                        <View
                          style={{
                            height: 3,
                            backgroundColor: colors.border,
                            borderRadius: 2,
                            marginBottom: Spacing['2'],
                          }}
                        >
                          <View
                            style={{
                              height: '100%',
                              width: `${progress}%`,
                              backgroundColor: colors.accent,
                              borderRadius: 2,
                            }}
                          />
                        </View>

                        <Text
                          style={{
                            fontFamily: FontFamily.ui,
                            fontSize: 13,
                            color: colors.textSubtle,
                          }}
                        >
                          {completedDays} of {devotional.totalDays} completed
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </>
          )}

          {devotionals.filter(
            (d) => (d.days ?? []).filter((day) => day.isRead).length >= d.totalDays && d.totalDays > 0
          ).length > 0 && (
            <SeeAllLink
              label="See All"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(tabs)/(you)/past-devotionals');
              }}
              colors={colors}
              hasAnimated={hasAnimated}
              index={globalIndex++}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ---- Sub-components ----

function SectionHeader({
  label,
  colors,
  hasAnimated,
  index,
  style,
}: {
  label: string;
  colors: ReturnType<typeof useTheme>['colors'];
  hasAnimated: React.MutableRefObject<boolean>;
  index: number;
  style?: object;
}) {
  return (
    <Animated.View
      entering={hasAnimated.current ? undefined : FadeIn.delay(index * 30).duration(Duration.slow)}
      style={[{ marginBottom: Spacing['3'] }, style]}
    >
      <Text
        style={{
          fontFamily: FontFamily.uiSemiBold,
          fontSize: 11,
          color: colors.accent,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </Animated.View>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
  colors,
  hasAnimated,
  index,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  colors: ReturnType<typeof useTheme>['colors'];
  hasAnimated: React.MutableRefObject<boolean>;
  index: number;
}) {
  return (
    <Animated.View
      entering={hasAnimated.current ? undefined : FadeIn.delay(index * 30).duration(Duration.slow)}
      style={{
        backgroundColor: colors.inputBackground,
        borderRadius: Radius.card,
        padding: Spacing['6'],
        alignItems: 'center',
        marginBottom: 10,
      }}
    >
      <View style={{ marginBottom: Spacing['3'], opacity: 0.6 }}>{icon}</View>
      <Text
        style={{
          fontFamily: FontFamily.body,
          fontSize: FontSize.sm,
          color: colors.textMuted,
          textAlign: 'center',
          lineHeight: 20,
          marginBottom: Spacing['1'],
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontFamily: FontFamily.ui,
          fontSize: 13,
          color: colors.textHint,
          textAlign: 'center',
          lineHeight: 18,
        }}
      >
        {subtitle}
      </Text>
    </Animated.View>
  );
}

function SeeAllLink({
  label,
  onPress,
  colors,
  hasAnimated,
  index,
}: {
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
  hasAnimated: React.MutableRefObject<boolean>;
  index: number;
}) {
  return (
    <Animated.View
      entering={hasAnimated.current ? undefined : FadeIn.delay(index * 30).duration(Duration.slow)}
      style={{ alignItems: 'flex-end', marginBottom: 4 }}
    >
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: Spacing['1'] }}
        accessibilityLabel={`${label}`}
        accessibilityRole="button"
      >
        <Text
          style={{
            fontFamily: FontFamily.uiMedium,
            fontSize: 13,
            color: colors.accent,
          }}
        >
          {label}
        </Text>
        <CaretRightIcon size={14} color={colors.accent} weight="bold" />
      </TouchableOpacity>
    </Animated.View>
  );
}
