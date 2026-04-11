import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { Duration } from '@/constants/animations';
import * as Haptics from 'expo-haptics';
import {
  CaretLeftIcon,
  SunDimIcon,
  SunIcon,
  SparkleIcon,
  StarIcon,
  SnowflakeIcon,
  CalendarIcon,
  InfoIcon,
} from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';

// --- Streak Society Tiers ---

interface StreakTier {
  id: string;
  name: string;
  minDays: number;
  maxDays: number; // exclusive upper bound (Infinity for top tier)
  accentColor: string;
  accentColorLight: string;
  iconComponent: 'sundim' | 'sun' | 'sparkle' | 'star';
}

const STREAK_TIERS: StreakTier[] = [
  {
    id: 'spark',
    name: 'Spark',
    minDays: 0,
    maxDays: 7,
    accentColor: '', // uses theme accent
    accentColorLight: '',
    iconComponent: 'sundim',
  },
  {
    id: 'glow',
    name: 'Glow',
    minDays: 7,
    maxDays: 30,
    accentColor: '',
    accentColorLight: '',
    iconComponent: 'sun',
  },
  {
    id: 'shine',
    name: 'Shine',
    minDays: 30,
    maxDays: 90,
    accentColor: '',
    accentColorLight: '',
    iconComponent: 'sparkle',
  },
  {
    id: 'radiance',
    name: 'Radiance',
    minDays: 90,
    maxDays: Infinity,
    accentColor: '',
    accentColorLight: '',
    iconComponent: 'star',
  },
];

function getCurrentTier(streak: number): StreakTier {
  for (let i = STREAK_TIERS.length - 1; i >= 0; i--) {
    if (streak >= STREAK_TIERS[i].minDays) {
      return STREAK_TIERS[i];
    }
  }
  return STREAK_TIERS[0];
}

function getNextTier(currentTier: StreakTier): StreakTier | null {
  const index = STREAK_TIERS.findIndex((t) => t.id === currentTier.id);
  if (index < STREAK_TIERS.length - 1) {
    return STREAK_TIERS[index + 1];
  }
  return null;
}

function getTierProgress(streak: number, tier: StreakTier): number {
  const nextTier = getNextTier(tier);
  if (!nextTier) return 1; // Top tier, always full
  const range = nextTier.minDays - tier.minDays;
  const progress = streak - tier.minDays;
  return Math.min(progress / range, 1);
}

/** Renders the correct icon for a tier */
function TierIcon({
  tier,
  size,
  color,
  weight,
}: {
  tier: StreakTier;
  size: number;
  color: string;
  weight: 'light' | 'fill';
}) {
  switch (tier.iconComponent) {
    case 'sundim':
      return <SunDimIcon size={size} color={color} weight={weight} />;
    case 'sun':
      return <SunIcon size={size} color={color} weight={weight} />;
    case 'sparkle':
      return <SparkleIcon size={size} color={color} weight={weight} />;
    case 'star':
      return <StarIcon size={size} color={color} weight={weight} />;
  }
}

type StatTooltipId = 'best' | 'freezes' | 'toFreeze';

export default function StreakSettingsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [activeTooltip, setActiveTooltip] = useState<StatTooltipId | null>(null);

  const streak = useUnfoldStore((s) => s.streakCurrent);
  const longestStreak = useUnfoldStore((s) => s.streakLongest);
  const freezes = useUnfoldStore((s) => s.streakFreezes);
  const isPremium = useUnfoldStore((s) => s.user?.isPremium ?? false);
  const weekendAmnesty = useUnfoldStore((s) => s.streakWeekendAmnesty);
  const lastReadDate = useUnfoldStore((s) => s.streakLastReadDate);
  const toggleWeekendAmnesty = useUnfoldStore((s) => s.toggleWeekendAmnesty);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleStatTap = (id: StatTooltipId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTooltip((prev) => (prev === id ? null : id));
  };

  const handleToggleAmnesty = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleWeekendAmnesty();
  };

  // Calculate days until next freeze
  const daysUntilFreeze = streak > 0 ? 7 - (streak % 7) : 7;
  // Handle edge case where streak % 7 === 0 and streak > 0
  const adjustedDaysUntilFreeze = daysUntilFreeze === 0 ? 7 : daysUntilFreeze;

  // Streak Society tier calculations
  const currentTier = useMemo(() => getCurrentTier(streak), [streak]);
  const nextTier = useMemo(() => getNextTier(currentTier), [currentTier]);
  const tierProgress = useMemo(() => getTierProgress(streak, currentTier), [streak, currentTier]);
  const tierColor = colors.accent;

  return (
    <SafeAreaView style={[ssStyles.flex1, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={ssStyles.header}>
        <TouchableOpacity activeOpacity={0.7} onPress={handleBack} style={ssStyles.backButton} accessibilityLabel="Go back" accessibilityRole="button">
          <CaretLeftIcon size={24} color={colors.text} weight="light" />
        </TouchableOpacity>
        <Text style={[ssStyles.headerTitle, { color: colors.text }]}>
          Streak Settings
        </Text>
      </View>

      <ScrollView style={ssStyles.flex1} contentContainerStyle={ssStyles.scrollContent}>
        {/* Streak Society Tier Card */}
        <Animated.View
          entering={FadeInDown.duration(500)}
          style={[ssStyles.tierCard, { backgroundColor: colors.inputBackground, borderColor: isDark ? `${colors.accent}30` : `${colors.accent}20` }]}
        >
          {/* Top section: tier icon + name + streak count */}
          <View style={ssStyles.tierTopRow}>
            <View style={ssStyles.tierLeftGroup}>
              <View style={[ssStyles.tierIconCircle, { backgroundColor: isDark ? `${colors.accent}1A` : `${colors.accent}15` }]}>
                <TierIcon
                  tier={currentTier}
                  size={26}
                  color={tierColor}
                  weight={streak >= 7 ? 'fill' : 'light'}
                />
              </View>
              <View>
                <Text style={[ssStyles.tierSocietyLabel, { color: colors.textSubtle }]}>
                  Streak Society
                </Text>
                <Text style={[ssStyles.tierName, { color: tierColor }]}>
                  {currentTier.name}
                </Text>
              </View>
            </View>

            {/* Streak count */}
            <View style={ssStyles.streakCountRight}>
              <Text style={[ssStyles.streakCountNumber, { color: colors.text }]}>
                {streak}
              </Text>
              <Text style={[ssStyles.streakCountUnit, { color: colors.textMuted }]}>
                {streak === 1 ? 'day' : 'days'}
              </Text>
            </View>
          </View>

          {/* Progress bar to next tier */}
          {nextTier ? (
            <View style={ssStyles.progressSection}>
              <View style={[ssStyles.progressTrack, { backgroundColor: isDark ? 'rgba(245, 240, 235, 0.08)' : 'rgba(28, 23, 16, 0.06)' }]}>
                <View
                  style={[ssStyles.progressFill, { width: `${Math.max(tierProgress * 100, 2)}%`, backgroundColor: tierColor }]}
                />
              </View>
              <View style={ssStyles.progressLabelsRow}>
                <Text style={[ssStyles.progressLabel, { color: colors.textSubtle }]}>
                  {nextTier.minDays - streak} days to {nextTier.name}
                </Text>
                <Text style={[ssStyles.progressLabel, { color: colors.textSubtle }]}>
                  {nextTier.minDays} days
                </Text>
              </View>
            </View>
          ) : (
            <View style={ssStyles.legendarySection}>
              <Text style={[ssStyles.legendaryText, { color: tierColor }]}>
                Legendary status achieved
              </Text>
            </View>
          )}

          {/* Last read info */}
          <Text style={[ssStyles.lastReadText, { color: colors.textHint }]}>
            {lastReadDate
              ? `Last devotional: ${new Date(lastReadDate).toLocaleDateString()}`
              : 'Start your streak by completing a devotional'}
          </Text>
        </Animated.View>

        {/* Tier roadmap - all 4 tiers shown as a row */}
        <Animated.View entering={FadeInDown.duration(500).delay(100)} style={ssStyles.tierRoadmapRow}>
          {STREAK_TIERS.map((tier) => {
            const isActive = tier.id === currentTier.id;
            const isPast = tier.minDays < currentTier.minDays;
            const iconColor = isActive || isPast ? colors.accent : colors.textHint;

            return (
              <View
                key={tier.id}
                style={[
                  ssStyles.tierRoadmapItem,
                  {
                    backgroundColor: isActive
                      ? (isDark ? `${colors.accent}10` : `${colors.accent}08`)
                      : 'transparent',
                    borderWidth: isActive ? 1 : 0,
                    borderColor: isActive
                      ? (isDark ? `${colors.accent}30` : `${colors.accent}20`)
                      : 'transparent',
                  },
                ]}
              >
                <TierIcon
                  tier={tier}
                  size={18}
                  color={iconColor}
                  weight={isActive || isPast ? 'fill' : 'light'}
                />
                <Text
                  style={[
                    ssStyles.tierRoadmapName,
                    {
                      fontFamily: isActive ? FontFamily.uiSemiBold : FontFamily.ui,
                      color: isActive ? colors.text : isPast ? colors.textMuted : colors.textHint,
                    },
                  ]}
                >
                  {tier.name}
                </Text>
                <Text style={[ssStyles.tierRoadmapRange, { color: colors.textHint }]}>
                  {tier.maxDays === Infinity ? `${tier.minDays}+` : `${tier.minDays}-${tier.maxDays - 1}`}
                </Text>
              </View>
            );
          })}
        </Animated.View>

        {/* Stats Grid */}
        <View style={ssStyles.statsGrid}>
          {/* Best Streak */}
          <View style={ssStyles.flex1}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => handleStatTap('best')}
              style={[
                ssStyles.statButton,
                {
                  backgroundColor: colors.inputBackground,
                  borderWidth: activeTooltip === 'best' ? 1 : 0,
                  borderColor: activeTooltip === 'best' ? colors.border : 'transparent',
                },
              ]}
            >
              <SunIcon size={24} color={colors.accent} weight="light" />
              <Text style={[ssStyles.statValue, { color: colors.text }]}>
                {longestStreak}
              </Text>
              <Text style={[ssStyles.statLabel, { color: colors.textMuted }]}>
                Best Streak
              </Text>
            </TouchableOpacity>
            {activeTooltip === 'best' && (
              <Animated.View
                entering={FadeIn.duration(Duration.normal)}
                exiting={FadeOut.duration(Duration.fast)}
                style={[ssStyles.tooltipBubble, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
              >
                <Text style={[ssStyles.tooltipText, { color: colors.textMuted }]}>
                  Your longest consecutive streak of daily devotionals
                </Text>
              </Animated.View>
            )}
          </View>

          {/* Freezes */}
          <View style={ssStyles.flex1}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => handleStatTap('freezes')}
              style={[
                ssStyles.statButton,
                {
                  backgroundColor: colors.inputBackground,
                  borderWidth: activeTooltip === 'freezes' ? 1 : 0,
                  borderColor: activeTooltip === 'freezes' ? colors.border : 'transparent',
                },
              ]}
            >
              <SnowflakeIcon size={24} color={colors.textSubtle} weight="light" />
              <Text style={[ssStyles.statValue, { color: colors.text }]}>
                {freezes}
              </Text>
              <Text style={[ssStyles.statLabel, { color: isPremium ? colors.textMuted : colors.textSubtle }]}>
                {isPremium ? 'Freezes' : 'Premium'}
              </Text>
            </TouchableOpacity>
            {activeTooltip === 'freezes' && (
              <Animated.View
                entering={FadeIn.duration(Duration.normal)}
                exiting={FadeOut.duration(Duration.fast)}
                style={[ssStyles.tooltipBubble, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
              >
                <Text style={[ssStyles.tooltipText, { color: colors.textMuted }]}>
                  Freezes protect your streak if you miss a day. They're used automatically.
                </Text>
              </Animated.View>
            )}
          </View>

          {/* Days to Freeze */}
          <View style={ssStyles.flex1}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => handleStatTap('toFreeze')}
              style={[
                ssStyles.statButton,
                {
                  backgroundColor: colors.inputBackground,
                  borderWidth: activeTooltip === 'toFreeze' ? 1 : 0,
                  borderColor: activeTooltip === 'toFreeze' ? colors.border : 'transparent',
                },
              ]}
            >
              <CalendarIcon size={24} color={colors.textSubtle} weight="light" />
              <Text style={[ssStyles.statValue, { color: colors.text }]}>
                {adjustedDaysUntilFreeze}
              </Text>
              <Text style={[ssStyles.statLabel, { color: colors.textMuted }]}>
                Till Freeze
              </Text>
            </TouchableOpacity>
            {activeTooltip === 'toFreeze' && (
              <Animated.View
                entering={FadeIn.duration(Duration.normal)}
                exiting={FadeOut.duration(Duration.fast)}
                style={[ssStyles.tooltipBubble, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
              >
                <Text style={[ssStyles.tooltipText, { color: colors.textMuted }]}>
                  Complete {adjustedDaysUntilFreeze} more {adjustedDaysUntilFreeze === 1 ? 'day' : 'days'} to earn your next streak freeze
                </Text>
              </Animated.View>
            )}
          </View>
        </View>

        {/* Weekend Amnesty Toggle */}
        <View style={[ssStyles.amnestyCard, { backgroundColor: colors.inputBackground }]}>
          <View style={ssStyles.amnestyRow}>
            <View style={ssStyles.flex1}>
              <Text style={[ssStyles.amnestyTitle, { color: colors.text }]}>
                Weekend Amnesty
              </Text>
              <Text style={[ssStyles.amnestyDescription, { color: colors.textMuted }]}>
                Saturdays and Sundays won't break your streak
              </Text>
            </View>
            <Switch
              value={weekendAmnesty}
              onValueChange={handleToggleAmnesty}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
              accessibilityRole="switch"
              accessibilityLabel="Weekend amnesty"
              accessibilityState={{ checked: weekendAmnesty }}
            />
          </View>
        </View>

        {/* Info Section */}
        <View style={[ssStyles.infoCard, { backgroundColor: colors.inputBackground }]}>
          <InfoIcon size={18} color={colors.textMuted} weight="light" style={ssStyles.infoIcon} />
          <View style={ssStyles.flex1}>
            <Text style={[ssStyles.infoText, { color: colors.textMuted }]}>
              Complete a 7-day streak to earn a freeze. Freezes automatically protect your streak if you miss a day.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const ssStyles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
  },
  backButton: {
    padding: Spacing['2'],
  },
  headerTitle: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 17,
    marginLeft: Spacing['3'],
  },
  scrollContent: {
    padding: Spacing['6'],
    paddingBottom: 100,
  },
  tierCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing['6'],
    marginBottom: Spacing['6'],
    overflow: 'hidden',
  },
  tierTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tierLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
  },
  tierIconCircle: {
    width: 48,
    height: 48,
    borderRadius: Radius['2xl'],
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierSocietyLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  tierName: {
    fontFamily: FontFamily.display,
    fontSize: FontSize['2xl'],
    marginTop: 1,
  },
  streakCountRight: {
    alignItems: 'flex-end',
  },
  streakCountNumber: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 32,
    letterSpacing: -1,
  },
  streakCountUnit: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
    marginTop: -2,
  },
  progressSection: {
    marginTop: Spacing['5'],
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  progressLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
  },
  legendarySection: {
    marginTop: Spacing['4'],
  },
  legendaryText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
    textAlign: 'center',
  },
  lastReadText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
    marginTop: Spacing['3'],
    textAlign: 'center',
  },
  tierRoadmapRow: {
    flexDirection: 'row',
    gap: Spacing['2'],
    marginBottom: Spacing['6'],
  },
  tierRoadmapItem: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 10,
  },
  tierRoadmapName: {
    fontSize: 10,
    marginTop: 4,
  },
  tierRoadmapRange: {
    fontFamily: FontFamily.ui,
    fontSize: 9,
    marginTop: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing['3'],
    marginBottom: Spacing['6'],
  },
  statButton: {
    borderRadius: Radius.md,
    padding: Spacing['4'],
    alignItems: 'center',
  },
  statValue: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize['2xl'],
    marginTop: Spacing['2'],
  },
  statLabel: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  tooltipBubble: {
    borderWidth: 1,
    borderRadius: 10,
    padding: Spacing['3'],
    marginTop: Spacing['2'],
  },
  tooltipText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
    lineHeight: 17,
  },
  amnestyCard: {
    borderRadius: Radius.lg,
    padding: Spacing['5'],
  },
  amnestyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amnestyTitle: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base,
  },
  amnestyDescription: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: Spacing['6'],
    padding: Spacing['4'],
    borderRadius: Radius.md,
  },
  infoIcon: {
    marginRight: Spacing['3'],
    marginTop: 2,
  },
  infoText: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
    lineHeight: 18,
  },
});
