import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
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
import { FontFamily } from '@/constants/fonts';
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <TouchableOpacity activeOpacity={0.7} onPress={handleBack} style={{ padding: 8 }}>
          <CaretLeftIcon size={24} color={colors.text} weight="light" />
        </TouchableOpacity>
        <Text
          style={{
            fontFamily: FontFamily.uiSemiBold,
            fontSize: 17,
            color: colors.text,
            marginLeft: 12,
          }}
        >
          Streak Settings
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
        {/* Streak Society Tier Card */}
        <Animated.View
          entering={FadeInDown.duration(500)}
          style={{
            backgroundColor: colors.inputBackground,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: isDark ? `${colors.accent}30` : `${colors.accent}20`,
            padding: 24,
            marginBottom: 24,
            overflow: 'hidden',
          }}
        >
          {/* Top section: tier icon + name + streak count */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: isDark ? `${colors.accent}1A` : `${colors.accent}15`,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <TierIcon
                  tier={currentTier}
                  size={26}
                  color={tierColor}
                  weight={streak >= 7 ? 'fill' : 'light'}
                />
              </View>
              <View>
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 11,
                    color: colors.textSubtle,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                  }}
                >
                  Streak Society
                </Text>
                <Text
                  style={{
                    fontFamily: FontFamily.display,
                    fontSize: 24,
                    color: tierColor,
                    marginTop: 1,
                  }}
                >
                  {currentTier.name}
                </Text>
              </View>
            </View>

            {/* Streak count */}
            <View style={{ alignItems: 'flex-end' }}>
              <Text
                style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 32,
                  color: colors.text,
                  letterSpacing: -1,
                }}
              >
                {streak}
              </Text>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 12,
                  color: colors.textMuted,
                  marginTop: -2,
                }}
              >
                {streak === 1 ? 'day' : 'days'}
              </Text>
            </View>
          </View>

          {/* Progress bar to next tier */}
          {nextTier ? (
            <View style={{ marginTop: 20 }}>
              <View
                style={{
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: isDark ? 'rgba(245, 240, 235, 0.08)' : 'rgba(28, 23, 16, 0.06)',
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    height: '100%',
                    width: `${Math.max(tierProgress * 100, 2)}%`,
                    borderRadius: 2,
                    backgroundColor: tierColor,
                  }}
                />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 11,
                    color: colors.textSubtle,
                  }}
                >
                  {nextTier.minDays - streak} days to {nextTier.name}
                </Text>
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 11,
                    color: colors.textSubtle,
                  }}
                >
                  {nextTier.minDays} days
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ marginTop: 16 }}>
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 13,
                  color: tierColor,
                  textAlign: 'center',
                }}
              >
                Legendary status achieved
              </Text>
            </View>
          )}

          {/* Last read info */}
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 12,
              color: colors.textHint,
              marginTop: 12,
              textAlign: 'center',
            }}
          >
            {lastReadDate
              ? `Last devotional: ${new Date(lastReadDate).toLocaleDateString()}`
              : 'Start your streak by completing a devotional'}
          </Text>
        </Animated.View>

        {/* Tier roadmap - all 4 tiers shown as a row */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(100)}
          style={{
            flexDirection: 'row',
            gap: 8,
            marginBottom: 24,
          }}
        >
          {STREAK_TIERS.map((tier) => {
            const isActive = tier.id === currentTier.id;
            const isPast = tier.minDays < currentTier.minDays;
            const iconColor = isActive || isPast ? colors.accent : colors.textHint;

            return (
              <View
                key={tier.id}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  backgroundColor: isActive
                    ? (isDark ? `${colors.accent}10` : `${colors.accent}08`)
                    : 'transparent',
                  borderRadius: 10,
                  paddingVertical: 10,
                  borderWidth: isActive ? 1 : 0,
                  borderColor: isActive
                    ? (isDark ? `${colors.accent}30` : `${colors.accent}20`)
                    : 'transparent',
                }}
              >
                <TierIcon
                  tier={tier}
                  size={18}
                  color={iconColor}
                  weight={isActive || isPast ? 'fill' : 'light'}
                />
                <Text
                  style={{
                    fontFamily: isActive ? FontFamily.uiSemiBold : FontFamily.ui,
                    fontSize: 10,
                    color: isActive ? colors.text : isPast ? colors.textMuted : colors.textHint,
                    marginTop: 4,
                  }}
                >
                  {tier.name}
                </Text>
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 9,
                    color: colors.textHint,
                    marginTop: 1,
                  }}
                >
                  {tier.maxDays === Infinity ? `${tier.minDays}+` : `${tier.minDays}-${tier.maxDays - 1}`}
                </Text>
              </View>
            );
          })}
        </Animated.View>

        {/* Stats Grid */}
        <View
          style={{
            flexDirection: 'row',
            gap: 12,
            marginBottom: 24,
          }}
        >
          {/* Best Streak */}
          <View style={{ flex: 1 }}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => handleStatTap('best')}
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: 12,
                padding: 16,
                alignItems: 'center',
                borderWidth: activeTooltip === 'best' ? 1 : 0,
                borderColor: activeTooltip === 'best' ? colors.border : 'transparent',
              }}
            >
              <SunIcon size={24} color={colors.accent} weight="light" />
              <Text
                style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 24,
                  color: colors.text,
                  marginTop: 8,
                }}
              >
                {longestStreak}
              </Text>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 12,
                  color: colors.textMuted,
                }}
              >
                Best Streak
              </Text>
            </TouchableOpacity>
            {activeTooltip === 'best' && (
              <Animated.View
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(150)}
                style={{
                  backgroundColor: colors.inputBackground,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  padding: 12,
                  marginTop: 8,
                }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 12,
                    color: colors.textMuted,
                    lineHeight: 17,
                  }}
                >
                  Your longest consecutive streak of daily devotionals
                </Text>
              </Animated.View>
            )}
          </View>

          {/* Freezes */}
          <View style={{ flex: 1 }}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => handleStatTap('freezes')}
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: 12,
                padding: 16,
                alignItems: 'center',
                borderWidth: activeTooltip === 'freezes' ? 1 : 0,
                borderColor: activeTooltip === 'freezes' ? colors.border : 'transparent',
              }}
            >
              <SnowflakeIcon size={24} color={colors.textSubtle} weight="light" />
              <Text
                style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 24,
                  color: colors.text,
                  marginTop: 8,
                }}
              >
                {freezes}
              </Text>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 12,
                  color: colors.textMuted,
                }}
              >
                Freezes
              </Text>
            </TouchableOpacity>
            {activeTooltip === 'freezes' && (
              <Animated.View
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(150)}
                style={{
                  backgroundColor: colors.inputBackground,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  padding: 12,
                  marginTop: 8,
                }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 12,
                    color: colors.textMuted,
                    lineHeight: 17,
                  }}
                >
                  Freezes protect your streak if you miss a day. They're used automatically.
                </Text>
              </Animated.View>
            )}
          </View>

          {/* Days to Freeze */}
          <View style={{ flex: 1 }}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => handleStatTap('toFreeze')}
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: 12,
                padding: 16,
                alignItems: 'center',
                borderWidth: activeTooltip === 'toFreeze' ? 1 : 0,
                borderColor: activeTooltip === 'toFreeze' ? colors.border : 'transparent',
              }}
            >
              <CalendarIcon size={24} color={colors.textSubtle} weight="light" />
              <Text
                style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 24,
                  color: colors.text,
                  marginTop: 8,
                }}
              >
                {adjustedDaysUntilFreeze}
              </Text>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 12,
                  color: colors.textMuted,
                }}
              >
                Till Freeze
              </Text>
            </TouchableOpacity>
            {activeTooltip === 'toFreeze' && (
              <Animated.View
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(150)}
                style={{
                  backgroundColor: colors.inputBackground,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  padding: 12,
                  marginTop: 8,
                }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 12,
                    color: colors.textMuted,
                    lineHeight: 17,
                  }}
                >
                  Complete {adjustedDaysUntilFreeze} more {adjustedDaysUntilFreeze === 1 ? 'day' : 'days'} to earn your next streak freeze
                </Text>
              </Animated.View>
            )}
          </View>
        </View>

        {/* Weekend Amnesty Toggle */}
        <View
          style={{
            backgroundColor: colors.inputBackground,
            borderRadius: 16,
            padding: 20,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 16,
                  color: colors.text,
                }}
              >
                Weekend Amnesty
              </Text>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 13,
                  color: colors.textMuted,
                  marginTop: 4,
                  lineHeight: 18,
                }}
              >
                Saturdays and Sundays won't break your streak
              </Text>
            </View>
            <Switch
              value={weekendAmnesty}
              onValueChange={handleToggleAmnesty}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Info Section */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            marginTop: 24,
            padding: 16,
            backgroundColor: colors.inputBackground,
            borderRadius: 12,
          }}
        >
          <InfoIcon size={18} color={colors.textMuted} weight="light" style={{ marginRight: 12, marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 13,
                color: colors.textMuted,
                lineHeight: 18,
              }}
            >
              Complete a 7-day streak to earn a freeze. Freezes automatically protect your streak if you miss a day.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
