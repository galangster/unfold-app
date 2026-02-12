import { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';

// Growth stages that evolve with streak length
// Visual metaphor: seed → sprout → sapling → tree → flourishing tree
type GrowthStage = 'seed' | 'sprout' | 'sapling' | 'tree' | 'flourishing';

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastReadDate: string | null; // ISO date
  graceDaysUsed: number; // 1 per week allowed (Sabbath rest concept)
}

interface StreakDisplayProps {
  streak?: StreakData;
  onPress?: () => void;
  size?: 'small' | 'medium' | 'large';
  compact?: boolean; // New: ultra-compact for header
}

// Get growth stage based on streak length
function getGrowthStage(streak: number): GrowthStage {
  if (streak === 0) return 'seed';
  if (streak < 3) return 'sprout';
  if (streak < 7) return 'sapling';
  if (streak < 21) return 'tree';
  return 'flourishing';
}

// Stage descriptions - encouraging, not shaming
const STAGE_INFO: Record<GrowthStage, { label: string; subtitle: string }> = {
  seed: {
    label: 'New beginnings',
    subtitle: 'Every journey starts with a single step',
  },
  sprout: {
    label: 'Taking root',
    subtitle: 'Small faithfulness, day by day',
  },
  sapling: {
    label: 'Growing steady',
    subtitle: 'The rhythm is becoming part of you',
  },
  tree: {
    label: 'Deeply rooted',
    subtitle: 'Consistency bears quiet fruit',
  },
  flourishing: {
    label: 'Abundant life',
    subtitle: 'Your faithfulness is beautiful',
  },
};

// Organic tree SVG paths that evolve
const TREE_PATHS: Record<GrowthStage, string> = {
  seed: 'M12 20c0-3 2-5 4-5s4 2 4 5', // Simple seed shape
  sprout: 'M12 20v-6m0 0c-2-3-2-5 0-8m0 8c2-3 2-5 0-8', // Two small leaves
  sapling: 'M12 22v-8m-3-2c2-4 6-4 6 0m-6 2c3-5 7-5 7 0', // Growing branches
  tree: 'M12 24v-10m-4-2c3-6 8-6 8 0m-6 2c4-7 10-7 10 0m-8 2c3-5 7-5 7 0', // Full tree
  flourishing: 'M12 26v-12m-5-2c4-7 10-7 10 0m-7 2c5-8 12-8 12 0m-9 2c4-6 9-6 9 0m-2-6c2-3 5-3 5 0', // Flourishing with details
};

// Color intensity evolves with stage
const STAGE_COLORS: Record<GrowthStage, { stroke: string; fill: string; glow: string }> = {
  seed: { stroke: '#8B7355', fill: 'transparent', glow: 'rgba(139, 115, 85, 0.1)' },
  sprout: { stroke: '#7A9E7A', fill: 'rgba(122, 158, 122, 0.2)', glow: 'rgba(122, 158, 122, 0.15)' },
  sapling: { stroke: '#6B9B6B', fill: 'rgba(107, 155, 107, 0.3)', glow: 'rgba(107, 155, 107, 0.2)' },
  tree: { stroke: '#5A8A5A', fill: 'rgba(90, 138, 90, 0.4)', glow: 'rgba(90, 138, 90, 0.25)' },
  flourishing: { stroke: '#4A9B4A', fill: 'rgba(74, 155, 74, 0.5)', glow: 'rgba(74, 155, 74, 0.35)' },
};

// Small inline SVG tree component
function GrowthTree({ stage, animated = true }: { stage: GrowthStage; animated?: boolean }) {
  const colors = STAGE_COLORS[stage];
  const scale = useSharedValue(animated ? 0.8 : 1);
  const opacity = useSharedValue(animated ? 0 : 1);

  useMemo(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 100 });
    opacity.value = withTiming(1, { duration: 400 });
  }, [stage, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[{ width: 48, height: 48 }, animatedStyle]}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: colors.glow,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {/* Simple tree representation using View shapes */}
        <View style={{ alignItems: 'center' }}>
          {/* Trunk */}
          <View
            style={{
              width: 2,
              height: stage === 'seed' ? 4 : stage === 'flourishing' ? 20 : 12,
              backgroundColor: colors.stroke,
              borderRadius: 1,
            }}
          />
          {/* Leaves/Canopy */}
          <View
            style={{
              width: stage === 'seed' ? 8 : stage === 'sprout' ? 12 : stage === 'sapling' ? 20 : 28,
              height: stage === 'seed' ? 8 : stage === 'sprout' ? 12 : stage === 'sapling' ? 18 : 24,
              backgroundColor: colors.fill,
              borderRadius: stage === 'seed' ? 4 : 4,
              borderWidth: 1.5,
              borderColor: colors.stroke,
              marginTop: -4,
            }}
          />
          {/* Extra flourish for higher stages */}
          {stage === 'tree' || stage === 'flourishing' ? (
            <>
              <View
                style={{
                  position: 'absolute',
                  width: 8,
                  height: 8,
                  backgroundColor: colors.fill,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: colors.stroke,
                  left: 8,
                  top: 12,
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  width: 6,
                  height: 6,
                  backgroundColor: colors.fill,
                  borderRadius: 3,
                  borderWidth: 1,
                  borderColor: colors.stroke,
                  right: 10,
                  top: 14,
                }}
              />
            </>
          ) : null}
          {stage === 'flourishing' ? (
            <View
              style={{
                position: 'absolute',
                width: 5,
                height: 5,
                backgroundColor: colors.fill,
                borderRadius: 2.5,
                borderWidth: 1,
                borderColor: colors.stroke,
                left: 14,
                top: 8,
              }}
            />
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

// Helper to get streak data from store
export function useStreakData(): StreakData {
  const streakCurrent = useUnfoldStore((s) => s.streakCurrent);
  const streakLongest = useUnfoldStore((s) => s.streakLongest);
  const streakLastReadDate = useUnfoldStore((s) => s.streakLastReadDate);
  const streakGraceDaysUsedThisWeek = useUnfoldStore((s) => s.streakGraceDaysUsedThisWeek);

  return {
    currentStreak: streakCurrent,
    longestStreak: streakLongest,
    lastReadDate: streakLastReadDate,
    graceDaysUsed: streakGraceDaysUsedThisWeek,
  };
}

// Main streak display component
export function StreakDisplay({
  streak: propStreak,
  onPress,
  size = 'medium',
  compact = false,
}: StreakDisplayProps) {
  const { colors } = useTheme();
  const storeStreak = useStreakData();
  const streak = propStreak ?? storeStreak;
  const stage = getGrowthStage(streak.currentStreak);
  const stageInfo = STAGE_INFO[stage];

  // Calculate if streak is "at risk" (haven't read today)
  const isAtRisk = useMemo(() => {
    if (!streak.lastReadDate) return false;
    const lastRead = new Date(streak.lastReadDate);
    const today = new Date();
    const daysSince = Math.floor((today.getTime() - lastRead.getTime()) / (1000 * 60 * 60 * 24));
    return daysSince >= 1 && streak.currentStreak > 0;
  }, [streak.lastReadDate, streak.currentStreak]);

  // Compact mode: just badge with tree icon
  if (compact) {
    if (streak.currentStreak === 0) return null;

    return (
      <Pressable onPress={onPress} disabled={!onPress}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isAtRisk ? `${colors.accent}12` : `${colors.accent}08`,
            borderRadius: 20,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderWidth: 1,
            borderColor: isAtRisk ? colors.accent : `${colors.accent}20`,
          }}
        >
          {/* Tiny tree icon */}
          <View
            style={{
              width: 6,
              height: 10,
              justifyContent: 'flex-end',
              alignItems: 'center',
              marginRight: 6,
            }}
          >
            <View
              style={{
                width: 1.5,
                height: 4,
                backgroundColor: colors.accent,
                borderRadius: 0.75,
              }}
            />
            <View
              style={{
                width: 6,
                height: 6,
                backgroundColor: `${colors.accent}40`,
                borderRadius: 3,
                borderWidth: 1,
                borderColor: colors.accent,
                marginTop: -2,
              }}
            />
          </View>
          <Text
            style={{
              fontFamily: FontFamily.mono,
              fontSize: 12,
              color: isAtRisk ? colors.accent : colors.text,
              letterSpacing: 0.3,
            }}
          >
            {streak.currentStreak}
          </Text>
        </View>
      </Pressable>
    );
  }

  // Gentle pulse animation for at-risk state
  const pulseOpacity = useSharedValue(1);
  if (isAtRisk) {
    pulseOpacity.value = withDelay(500, withTiming(0.6, { duration: 1500 }));
  }

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: isAtRisk ? pulseOpacity.value : 1,
  }));

  const height = size === 'small' ? 56 : size === 'large' ? 120 : 80;
  const padding = size === 'small' ? 12 : size === 'large' ? 24 : 16;

  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Animated.View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.inputBackground,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: isAtRisk ? colors.accent : colors.border,
            padding,
            height,
          },
          containerAnimatedStyle,
        ]}
      >
        <GrowthTree stage={stage} />

        <View style={{ marginLeft: 16, flex: 1 }}>
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: size === 'large' ? 17 : 15,
              color: colors.text,
              marginBottom: 2,
            }}
          >
            {streak.currentStreak > 0
              ? `${streak.currentStreak} day${streak.currentStreak === 1 ? '' : 's'} of presence`
              : stageInfo.label}
          </Text>
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: size === 'large' ? 14 : 12,
              color: isAtRisk ? colors.accent : colors.textSubtle,
            }}
          >
            {isAtRisk ? 'Your tree misses you today' : stageInfo.subtitle}
          </Text>
        </View>

        {streak.currentStreak > 0 && (
          <View
            style={{
              width: size === 'large' ? 48 : 36,
              height: size === 'large' ? 48 : 36,
              borderRadius: size === 'large' ? 24 : 18,
              backgroundColor: isAtRisk ? 'transparent' : `${colors.accent}15`,
              borderWidth: 1,
              borderColor: isAtRisk ? colors.accent : `${colors.accent}30`,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.mono,
                fontSize: size === 'large' ? 14 : 11,
                color: isAtRisk ? colors.accent : colors.accent,
                letterSpacing: 0.5,
              }}
            >
              {streak.currentStreak}
            </Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// Compact version for header area
export function StreakBadge({ streak }: { streak: StreakData }) {
  const { colors } = useTheme();
  const stage = getGrowthStage(streak.currentStreak);

  if (streak.currentStreak === 0) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: `${colors.accent}12`,
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderWidth: 1,
        borderColor: `${colors.accent}25`,
      }}
    >
      {/* Tiny tree icon */}
      <View
        style={{
          width: 6,
          height: 10,
          justifyContent: 'flex-end',
          alignItems: 'center',
          marginRight: 6,
        }}
      >
        <View
          style={{
            width: 1.5,
            height: 4,
            backgroundColor: colors.accent,
            borderRadius: 0.75,
          }}
        />
        <View
          style={{
            width: 6,
            height: 6,
            backgroundColor: `${colors.accent}40`,
            borderRadius: 3,
            borderWidth: 1,
            borderColor: colors.accent,
            marginTop: -2,
          }}
        />
      </View>
      <Text
        style={{
          fontFamily: FontFamily.mono,
          fontSize: 12,
          color: colors.accent,
          letterSpacing: 0.3,
        }}
      >
        {streak.currentStreak}
      </Text>
    </View>
  );
}

// Helper to calculate streak from devotional data
export function calculateStreak(
  devotionals: Array<{ days: Array<{ isRead: boolean; readAt?: string }> }>,
  journalEntries: Array<{ createdAt: string }>
): StreakData {
  // Get all reading dates
  const readingDates = new Set<string>();

  devotionals.forEach((devotional) => {
    devotional.days.forEach((day) => {
      if (day.isRead && day.readAt) {
        const date = new Date(day.readAt).toDateString();
        readingDates.add(date);
      }
    });
  });

  // Also count days with journal entries as "present"
  journalEntries.forEach((entry) => {
    const date = new Date(entry.createdAt).toDateString();
    readingDates.add(date);
  });

  const sortedDates = Array.from(readingDates)
    .map((d) => new Date(d).getTime())
    .sort((a, b) => b - a); // Newest first

  if (sortedDates.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastReadDate: null,
      graceDaysUsed: 0,
    };
  }

  // Calculate current streak
  let currentStreak = 1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const lastRead = new Date(sortedDates[0]!);
  lastRead.setHours(0, 0, 0, 0);

  // Check if streak is still alive (read today or yesterday)
  const isStreakActive = lastRead.getTime() >= yesterday.getTime();

  if (!isStreakActive) {
    return {
      currentStreak: 0,
      longestStreak: calculateLongestStreak(sortedDates),
      lastReadDate: new Date(sortedDates[0]!).toISOString(),
      graceDaysUsed: 0,
    };
  }

  // Count consecutive days
  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = new Date(sortedDates[i - 1]!);
    const currDate = new Date(sortedDates[i]!);

    const diffDays = Math.floor(
      (prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 1) {
      currentStreak++;
    } else {
      break;
    }
  }

  return {
    currentStreak,
    longestStreak: calculateLongestStreak(sortedDates),
    lastReadDate: new Date(sortedDates[0]!).toISOString(),
    graceDaysUsed: 0, // TODO: Track grace days per week
  };
}

function calculateLongestStreak(sortedDates: number[]): number {
  if (sortedDates.length === 0) return 0;

  let longest = 1;
  let current = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = new Date(sortedDates[i - 1]!);
    const currDate = new Date(sortedDates[i]!);

    const diffDays = Math.floor(
      (prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 1) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}
