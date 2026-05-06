import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput, StyleSheet, LayoutChangeEvent, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useCrossTabBack } from '@/hooks/useCrossTabBack';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  clamp,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
// Old Swipeable API removed — crashes on Fabric. Using Gesture.Pan() instead (see SwipeableStudyCard).
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, BookOpenIcon, CheckIcon, DownloadSimpleIcon, MagnifyingGlassIcon, XCircleIcon, TrashIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, Devotional } from '@/lib/store';
import { format } from 'date-fns';
import { exportDevotionalToPDF, isPDFExportSupported } from '@/lib/pdf-export';

// ============================================================================
// Segmented Control
// ============================================================================

type PastSeriesTab = 'progress' | 'completed';

interface SegmentedControlProps {
  activeTab: PastSeriesTab;
  onTabChange: (tab: PastSeriesTab) => void;
}

function SegmentedControl({ activeTab, onTabChange }: SegmentedControlProps) {
  const { colors } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);

  const activeIndex = activeTab === 'progress' ? 0 : 1;
  const segmentWidth = containerWidth > 0 ? (containerWidth - 4) / 2 : 0;

  const indicatorTranslateX = useSharedValue(activeIndex * segmentWidth);

  // Update animation when tab changes — fast ease-out, no bounce
  const prevIndex = useRef(activeIndex);
  const containerWidthRef = useRef(0);

  useEffect(() => {
    if (segmentWidth <= 0) return;

    const widthChanged = containerWidthRef.current !== containerWidth;
    const tabChanged = prevIndex.current !== activeIndex;
    const targetX = activeIndex * segmentWidth;

    // When containerWidth changes and we know the index, set position without animation.
    if (widthChanged) {
      containerWidthRef.current = containerWidth;
      indicatorTranslateX.value = targetX;
      prevIndex.current = activeIndex;
      return;
    }

    if (tabChanged) {
      indicatorTranslateX.value = withTiming(activeIndex * segmentWidth, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      prevIndex.current = activeIndex;
    }
  }, [activeIndex, containerWidth, indicatorTranslateX, segmentWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorTranslateX.value }],
    width: segmentWidth,
  }));

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    setContainerWidth(width);
  }, []);

  const handlePress = useCallback(
    (tab: PastSeriesTab) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onTabChange(tab);
    },
    [onTabChange],
  );

  return (
    <View
      onLayout={handleLayout}
      style={[
        segStyles.container,
        {
          backgroundColor: colors.inputBackground,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Sliding indicator */}
      {segmentWidth > 0 && (
        <Animated.View
          style={[
            segStyles.indicator,
            {
              backgroundColor: colors.glassBackground,
              borderColor: colors.glassBorder,
              shadowColor: '#000',
            },
            indicatorStyle,
          ]}
        />
      )}

      {/* Segments */}
      <TouchableOpacity
        onPress={() => handlePress('progress')}
        style={segStyles.segment}
        activeOpacity={0.7}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'progress' }}
        accessibilityLabel="In Progress tab, 1 of 2"
      >
        <Text
          style={[
            segStyles.segmentText,
            {
              fontFamily:
                activeTab === 'progress'
                  ? FontFamily.uiMedium
                  : FontFamily.ui,
              color:
                activeTab === 'progress'
                  ? colors.text
                  : colors.textSubtle,
            },
          ]}
        >
          In Progress
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => handlePress('completed')}
        style={segStyles.segment}
        activeOpacity={0.7}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'completed' }}
        accessibilityLabel="Completed tab, 2 of 2"
      >
        <Text
          style={[
            segStyles.segmentText,
            {
              fontFamily:
                activeTab === 'completed'
                  ? FontFamily.uiMedium
                  : FontFamily.ui,
              color:
                activeTab === 'completed'
                  ? colors.text
                  : colors.textSubtle,
            },
          ]}
        >
          Completed
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const segStyles = StyleSheet.create({
  container: {
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 2,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 2,
    left: 2,
    height: 30,
    borderRadius: Radius.lg,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    zIndex: 1,
  },
  segmentText: {
    fontSize: FontSize.sm,
  },
});

// ============================================================================
// Swipeable Study Card (Gesture.Pan — Fabric-compatible)
// ============================================================================

const SWIPE_ACTION_WIDTH = 56;
const SWIPE_SNAP_THRESHOLD = SWIPE_ACTION_WIDTH * 0.35;
const EASE_OUT = Easing.out(Easing.cubic);
const SWIPE_TIMING_CONFIG = { duration: Duration.normal, easing: EASE_OUT };

interface SwipeableStudyCardProps {
  children: React.ReactNode;
  onDelete: () => void;
}

function SwipeableStudyCard({ children, onDelete }: SwipeableStudyCardProps) {
  const { colors } = useTheme();
  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);

  const close = useCallback(() => {
    translateX.value = withTiming(0, SWIPE_TIMING_CONFIG);
  }, [translateX]);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    close();
    onDelete();
  }, [onDelete, close]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-5, 5])
    .onStart(() => {
      contextX.value = translateX.value;
    })
    .onUpdate((e) => {
      const raw = contextX.value + e.translationX;
      translateX.value = clamp(raw, -SWIPE_ACTION_WIDTH, 0);
    })
    .onEnd((e) => {
      const isOpen = translateX.value < -SWIPE_SNAP_THRESHOLD;
      const isFlick = e.velocityX < -500;

      if (isOpen || isFlick) {
        translateX.value = withTiming(-SWIPE_ACTION_WIDTH, SWIPE_TIMING_CONFIG);
      } else {
        translateX.value = withTiming(0, SWIPE_TIMING_CONFIG);
      }
    });

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_ACTION_WIDTH * 0.4, SWIPE_ACTION_WIDTH],
      [0, 0.7, 1],
    ),
  }));

  return (
    <View style={swipeStyles.outerContainer}>
      {/* Delete action — positioned behind the card, right-aligned */}
      <View style={swipeStyles.cardArea}>
        <Animated.View style={[swipeStyles.actionsContainer, actionsStyle]}>
          <TouchableOpacity
            onPress={handleDelete}
            activeOpacity={0.7}
            style={swipeStyles.actionButton}
            accessibilityRole="button"
            accessibilityLabel="Delete study"
          >
            <View style={[swipeStyles.actionCircle, { backgroundColor: colors.error }]}>
              <TrashIcon size={17} color="#FFFFFF" weight="regular" />
            </View>
            <Text style={[swipeStyles.actionLabel, { color: colors.textSubtle }]}>Delete</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Sliding card content */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={contentStyle}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const swipeStyles = StyleSheet.create({
  outerContainer: {
    position: 'relative',
  },
  cardArea: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: Spacing['3'], // match card marginBottom
    overflow: 'hidden',
    borderTopRightRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
  },
  actionsContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: SWIPE_ACTION_WIDTH,
    paddingRight: 4,
  },
  actionButton: {
    width: SWIPE_ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  actionCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 10,
  },
});

// ============================================================================
// Devotional Card
// ============================================================================

interface DevotionalCardProps {
  item: Devotional;
  colors: ReturnType<typeof useTheme>['colors'];
  exportingId: string | null;
  exportSuccessId: string | null;
  onSelect: (id: string) => void;
  onExport: (devotional: Devotional) => void;
}

function DevotionalCard({ item, colors, exportingId, exportSuccessId, onSelect, onExport }: DevotionalCardProps) {
  const completedDays = (item.days ?? []).filter((d) => d.isRead).length;
  const isComplete = completedDays >= item.totalDays;
  const progress = (completedDays / item.totalDays) * 100;
  const createdDate = format(new Date(item.createdAt), 'MMM d, yyyy');

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onSelect(item.id)}
      style={{
        backgroundColor: colors.inputBackground,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: Spacing['5'],
        marginBottom: Spacing['3'],
      }}
    >
      {/* Top row: date + download circle */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text
          style={{
            fontFamily: FontFamily.mono,
            fontSize: 11,
            color: colors.textHint,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {createdDate}
        </Text>

        <TouchableOpacity activeOpacity={0.7}
          onPress={(e) => { e.stopPropagation(); onExport(item); }}
          disabled={exportingId !== null}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: `${colors.accent}15`,
            justifyContent: 'center',
            alignItems: 'center',
            opacity: exportingId !== null && exportingId !== item.id ? 0.3 : 1,
          }}
          accessibilityLabel="Export as PDF"
          accessibilityRole="button"
          accessibilityState={{ disabled: exportingId !== null }}
        >
          {exportingId === item.id ? (
            <ActivityIndicator size={18} color={colors.accent} />
          ) : exportSuccessId === item.id ? (
            <CheckIcon size={22} color={colors.accent} weight="bold" />
          ) : (
            <DownloadSimpleIcon size={22} color={colors.accent} weight="regular" />
          )}
        </TouchableOpacity>
      </View>

      {/* Title + progress (progress bar only for in-progress studies) */}
      <View>
        <Text
          style={{
            fontFamily: FontFamily.display,
            fontSize: 22,
            color: colors.text,
            lineHeight: 28,
            marginBottom: isComplete ? 0 : Spacing['3'],
          }}
        >
          {item.title}
        </Text>

        {!isComplete && (
          <>
            <View
              style={{
                height: 2,
                backgroundColor: colors.border,
                borderRadius: 1,
                marginBottom: Spacing['2'],
              }}
            >
              <View
                style={{
                  height: '100%',
                  width: `${progress}%`,
                  backgroundColor: colors.accent,
                  borderRadius: 1,
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
              Day {item.currentDay} of {item.totalDays}
            </Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ============================================================================
// Main Screen
// ============================================================================

export default function PastDevotionalsScreen() {
  const router = useRouter();
  const { handleBack, isFromHome } = useCrossTabBack();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const removeDevotional = useUnfoldStore((s) => s.removeDevotional);
  const premiumPolicy = usePremiumAccessPolicy();
  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const checkIns = useUnfoldStore((s) => s.checkIns);

  const [activeTab, setActiveTab] = useState<PastSeriesTab>('progress');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportSuccessId, setExportSuccessId] = useState<string | null>(null);
  const exportSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<TextInput>(null);
  const scrollY = useSharedValue(0);

  useEffect(() => {
    return () => {
      if (exportSuccessTimerRef.current) clearTimeout(exportSuccessTimerRef.current);
    };
  }, []);

  // Filter devotionals by tab and search query, most recent first
  const filteredDevotionals = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return (devotionals ?? [])
      .filter((d) => {
        const days = d.days ?? [];
        const completedDays = days.filter((day) => day.isRead).length;
        const isComplete = completedDays >= d.totalDays;
        const matchesTab = activeTab === 'completed' ? isComplete : !isComplete;
        if (!matchesTab) return false;
        // Search filter
        if (query) {
          const searchableText = [
            d.title,
            ...days.map((day) => day.title),
            ...days.map((day) => day.scriptureReference),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return searchableText.includes(query);
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [devotionals, activeTab, searchQuery]);

  // Pull-down to reveal search — detect overscroll
  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = event.nativeEvent.contentOffset.y;
    scrollY.value = y;
    if (y < -50 && !searchVisible) {
      setSearchVisible(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Focus the search input after a short delay for the animation
      setTimeout(() => searchInputRef.current?.focus(), 200);
    }
  }, [searchVisible, scrollY]);

  const handleClearSearch = useCallback(() => {
    if (searchQuery) {
      setSearchQuery('');
    } else {
      setSearchVisible(false);
      searchInputRef.current?.blur();
    }
  }, [searchQuery]);

  const handleSelectDevotional = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: isFromHome ? '/(tabs)/(today)/series-detail' : '/(tabs)/(you)/series-detail',
      params: { id },
    });
  }, [isFromHome, router]);

  const handleExportPDF = useCallback(async (devotional: Devotional) => {
    if (exportingId) return;

    if (premiumPolicy !== 'granted') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      router.push('/paywall');
      return;
    }

    if (!isPDFExportSupported()) {
      return;
    }

    setExportingId(devotional.id);
    try {
      // Gather journal entries for this devotional
      const devJournals = journalEntries
        .filter((j) => j.devotionalId === devotional.id)
        .map((j) => ({
          dayNumber: j.dayNumber,
          content: j.content,
          questionResponses: j.questionResponses,
        }));

      // Gather check-ins for this devotional
      const devCheckIns = checkIns
        .filter((c) => c.devotionalId === devotional.id)
        .map((c) => ({
          dayNumber: c.dayNumber,
          mood: c.mood,
          moodLabel: c.moodLabel,
        }));

      const success = await exportDevotionalToPDF(devotional, {
        accentColor: colors.accent,
        journalEntries: devJournals,
        checkIns: devCheckIns,
      });
      if (success) {
        setExportSuccessId(devotional.id);
        if (exportSuccessTimerRef.current) clearTimeout(exportSuccessTimerRef.current);
        exportSuccessTimerRef.current = setTimeout(() => setExportSuccessId(null), 2000);
      }
    } finally {
      setExportingId(null);
    }
  }, [exportingId, premiumPolicy, router, journalEntries, checkIns, colors.accent]);

  const handleDeleteDevotional = useCallback((devotional: Devotional) => {
    Alert.alert(
      'Delete this devotional?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            removeDevotional(devotional.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
    );
  }, [removeDevotional]);

  const renderItem = useCallback(({ item }: { item: Devotional }) => (
    <SwipeableStudyCard onDelete={() => handleDeleteDevotional(item)}>
      <DevotionalCard
        item={item}
        colors={colors}
        exportingId={exportingId}
        exportSuccessId={exportSuccessId}
        onSelect={handleSelectDevotional}
        onExport={handleExportPDF}
      />
    </SwipeableStudyCard>
  ), [colors, exportingId, exportSuccessId, handleSelectDevotional, handleExportPDF, handleDeleteDevotional]);

  if (devotionals.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing['4'], paddingVertical: Spacing['3'] }}>
            <TouchableOpacity activeOpacity={0.7}
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
              My Devotionals
            </Text>
          </View>

          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
            style={{ alignItems: 'center', paddingTop: 60 }}
          >
            <BookOpenIcon size={48} color={colors.textHint} weight="light" />
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: FontSize.base,
                color: colors.textMuted,
                textAlign: 'center',
                marginTop: Spacing['4'],
              }}
            >
              No devotionals yet
            </Text>
          </Animated.View>
        </SafeAreaView>
      </View>
    );
  }

  const emptyLabel = searchQuery.trim()
    ? `No devotionals match "${searchQuery}"`
    : activeTab === 'completed'
      ? 'No completed devotionals yet'
      : 'No devotionals in progress';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing['4'], paddingVertical: Spacing['3'] }}>
          <TouchableOpacity activeOpacity={0.7}
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
            My Devotionals
          </Text>
        </View>

        {/* Segmented Control */}
        <View style={{ paddingHorizontal: Spacing['6'], marginBottom: Spacing['4'] }}>
          <SegmentedControl activeTab={activeTab} onTabChange={setActiveTab} />
        </View>

        {/* Pull-down search bar */}
        {searchVisible && (
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(Duration.fast).easing(Ease.out)}
            exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
            style={searchStyles.container}
          >
            <View
              style={[
                searchStyles.inputRow,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.border,
                },
              ]}
            >
              <MagnifyingGlassIcon size={16} color={colors.textMuted} weight="light" />
              <TextInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search devotionals, days, scriptures..."
                placeholderTextColor={colors.textHint}
                style={[
                  searchStyles.input,
                  { color: colors.text },
                ]}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                accessibilityLabel="Search studies"
              />
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleClearSearch}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Clear search"
                accessibilityRole="button"
              >
                <XCircleIcon size={18} color={colors.textMuted} weight="fill" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {filteredDevotionals.length === 0 ? (
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).easing(Ease.out)}
            style={{ alignItems: 'center', paddingTop: 48 }}
          >
            <BookOpenIcon size={36} color={colors.textHint} weight="light" />
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: 15,
                color: colors.textMuted,
                textAlign: 'center',
                marginTop: Spacing['3'],
              }}
            >
              {emptyLabel}
            </Text>
          </Animated.View>
        ) : (
          <>
          {!searchVisible && filteredDevotionals.length > 3 && (
            <View style={{ alignItems: 'center', paddingBottom: Spacing['2'] }}>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 12,
                  color: colors.textHint,
                }}
              >
                Pull down to search
              </Text>
            </View>
          )}
          <FlashList
            data={filteredDevotionals}
            renderItem={renderItem as any}
            keyExtractor={(item: Devotional) => item.id}
            contentContainerStyle={{ paddingHorizontal: Spacing['6'], paddingTop: Spacing['1'], paddingBottom: 100 } as any}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll as any}
            scrollEventThrottle={16}
          />
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

// ============================================================================
// Search Bar Styles
// ============================================================================

const searchStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['6'],
    marginBottom: Spacing['3'],
    gap: Spacing['2'],
  },
  inputRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    height: 40,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing['3'],
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    paddingVertical: 0,
  },
  cancelButton: {
    paddingVertical: Spacing['2'],
    paddingHorizontal: Spacing['1'],
  },
  cancelText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
});
