import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, BookOpenIcon, LockIcon, CheckIcon, DownloadSimpleIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
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
  if (prevIndex.current !== activeIndex && segmentWidth > 0) {
    indicatorTranslateX.value = withTiming(activeIndex * segmentWidth, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
    prevIndex.current = activeIndex;
  }

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorTranslateX.value }],
    width: segmentWidth,
  }));

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    setContainerWidth(width);
  }, []);

  // When containerWidth changes and we know the index, set position without animation
  const containerWidthRef = useRef(0);
  if (containerWidth > 0 && containerWidthRef.current !== containerWidth) {
    containerWidthRef.current = containerWidth;
    indicatorTranslateX.value = activeIndex * ((containerWidth - 4) / 2);
  }

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
// Main Screen
// ============================================================================

export default function PastDevotionalsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const setCurrentDevotional = useUnfoldStore((s) => s.setCurrentDevotional);
  const user = useUnfoldStore((s) => s.user);
  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const checkIns = useUnfoldStore((s) => s.checkIns);

  const [activeTab, setActiveTab] = useState<PastSeriesTab>('progress');
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportSuccessId, setExportSuccessId] = useState<string | null>(null);
  const exportSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (exportSuccessTimerRef.current) clearTimeout(exportSuccessTimerRef.current);
    };
  }, []);

  // Filter devotionals by tab
  const filteredDevotionals = useMemo(() => {
    return devotionals.filter((d) => {
      const completedDays = d.days.filter((day) => day.isRead).length;
      const isComplete = completedDays >= d.totalDays;
      return activeTab === 'completed' ? isComplete : !isComplete;
    });
  }, [devotionals, activeTab]);

  const handleSelectDevotional = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentDevotional(id);
    router.push('/(tabs)/(today)/reading');
  }, [setCurrentDevotional, router]);

  const handleExportPDF = useCallback(async (devotional: Devotional) => {
    if (exportingId) return;

    if (!user?.isPremium) {
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

      await exportDevotionalToPDF(devotional, {
        accentColor: colors.accent,
        journalEntries: devJournals,
        checkIns: devCheckIns,
      });
      setExportSuccessId(devotional.id);
      if (exportSuccessTimerRef.current) clearTimeout(exportSuccessTimerRef.current);
      exportSuccessTimerRef.current = setTimeout(() => setExportSuccessId(null), 2000);
    } finally {
      setExportingId(null);
    }
  }, [exportingId, user?.isPremium, router, journalEntries, checkIns, colors.accent]);

  const renderItem = useCallback(({ item }: { item: Devotional }) => {
    const completedDays = item.days.filter((d) => d.isRead).length;
    const progress = (completedDays / item.totalDays) * 100;
    const createdDate = format(new Date(item.createdAt), 'MMM d, yyyy');

    return (
      <View
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
            onPress={() => handleExportPDF(item)}
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

        {/* Tappable content area */}
        <TouchableOpacity activeOpacity={0.7}
          onPress={() => handleSelectDevotional(item.id)}
        >
          <Text
            style={{
              fontFamily: FontFamily.display,
              fontSize: 22,
              color: colors.text,
              lineHeight: 28,
              marginBottom: Spacing['3'],
            }}
          >
            {item.title}
          </Text>

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
            {completedDays === item.totalDays
              ? `${item.totalDays} days completed`
              : `Day ${item.currentDay} of ${item.totalDays}`}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }, [colors, exportingId, exportSuccessId, handleSelectDevotional, handleExportPDF, user?.isPremium]);

  if (devotionals.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing['4'], paddingVertical: Spacing['3'] }}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
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
              Past Series
            </Text>
          </View>

          <Animated.View
            entering={FadeIn.duration(400)}
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

  const emptyLabel = activeTab === 'completed'
    ? 'No completed series yet'
    : 'No series in progress';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing['4'], paddingVertical: Spacing['3'] }}>
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
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
            Past Series
          </Text>
        </View>

        {/* Segmented Control */}
        <View style={{ paddingHorizontal: Spacing['6'], marginBottom: Spacing['4'] }}>
          <SegmentedControl activeTab={activeTab} onTabChange={setActiveTab} />
        </View>

        {filteredDevotionals.length === 0 ? (
          <Animated.View
            entering={FadeIn.duration(300)}
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
          <FlashList
            data={filteredDevotionals}
            renderItem={renderItem as any}
            keyExtractor={(item: Devotional) => item.id}
            contentContainerStyle={{ paddingHorizontal: Spacing['6'], paddingTop: Spacing['1'], paddingBottom: 100 } as any}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </View>
  );
}
