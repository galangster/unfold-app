import { View, Text, TouchableOpacity } from 'react-native';
import { Flame, Snowflake } from 'lucide-react-native';
import Animated, { 
  FadeIn, 
  FadeInUp, 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  useDerivedValue,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { useEffect, useState, useCallback } from 'react';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { SparkleBurst } from './SparkleBurst';

interface StreakDisplayProps {
  size?: 'small' | 'medium' | 'large';
  compact?: boolean;
  showFreeze?: boolean;
  onPress?: () => void;
}

// Milestone streaks that trigger celebration
const MILESTONES = [7, 30, 100, 365];

export function StreakDisplay({ 
  size = 'medium', 
  compact, 
  showFreeze = true,
  onPress 
}: StreakDisplayProps) {
  const { colors, isDark } = useTheme();
  const streak = useUnfoldStore((s) => s.streakCurrent);
  const freezes = useUnfoldStore((s) => s.streakFreezes);

  // Animated streak value for spring animation
  const animatedStreak = useSharedValue(streak);
  const [displayStreak, setDisplayStreak] = useState(streak);
  const [previousStreak, setPreviousStreak] = useState(streak);
  const [showCelebration, setShowCelebration] = useState(false);

  // Flame flicker animation
  const flickerScale = useSharedValue(1);
  const flickerOpacity = useSharedValue(1);

  // Start flame flicker
  useEffect(() => {
    flickerScale.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.98, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    flickerOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200 }),
        withTiming(0.85, { duration: 1200 })
      ),
      -1,
      true
    );
  }, []);

  // Spring animation when streak changes with overshoot
  useEffect(() => {
    if (streak !== animatedStreak.value) {
      // Check for milestone
      const wasMilestone = MILESTONES.includes(streak) && streak > previousStreak;
      
      // More dramatic spring for milestones
      const springConfig = wasMilestone 
        ? { damping: 8, stiffness: 150, mass: 0.8 }
        : { damping: 10, stiffness: 120, mass: 1 };
      
      animatedStreak.value = withSpring(streak, springConfig);

      if (wasMilestone) {
        setShowCelebration(true);
        // Longer celebration for milestones
        setTimeout(() => setShowCelebration(false), 1500);
      }

      setPreviousStreak(streak);
    }
  }, [streak, previousStreak]);

  // Update display value during animation (throttled)
  const animatedValue = useDerivedValue(() => {
    const rounded = Math.round(animatedStreak.value);
    if (rounded !== displayStreak) {
      runOnJS(setDisplayStreak)(rounded);
    }
    return animatedStreak.value;
  });

  const sizeConfig = compact
    ? { flame: 16, number: 14, freeze: 12, padding: 6 }
    : size === 'small'
    ? { flame: 16, number: 14, freeze: 12, padding: 6 }
    : size === 'large'
    ? { flame: 32, number: 28, freeze: 20, padding: 14 }
    : { flame: 24, number: 18, freeze: 16, padding: 10 };

  const config = sizeConfig;
  const isLongStreak = streak >= 7;
  const isMilestone = MILESTONES.includes(streak);

  // Animated styles
  const flameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flickerScale.value }],
    opacity: flickerOpacity.value,
  }));

  const numberStyle = useAnimatedStyle(() => ({
    transform: [{ 
      scale: 1 + (animatedStreak.value - Math.round(animatedStreak.value)) * 0.15 
    }],
  }));

  const containerGlowStyle = useAnimatedStyle(() => ({
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: isMilestone ? withSpring(0.6, { damping: 10 }) : 0,
    shadowRadius: isMilestone ? 20 : 0,
    elevation: isMilestone ? 12 : 0,
  }));

  const milestonePulseStyle = useAnimatedStyle(() => {
    if (!isMilestone) return {};
    return {
      transform: [
        { 
          scale: withRepeat(
            withSequence(
              withTiming(1, { duration: 1000 }),
              withTiming(1.05, { duration: 1000 })
            ),
            -1,
            true
          ) 
        }
      ],
    };
  });

  // Accessibility label
  const accessibilityLabel = streak === 0 
    ? "Start your streak today"
    : `${streak} day${streak !== 1 ? 's' : ''} streak${isMilestone ? ', milestone reached!' : ''}`;

  const accessibilityHint = onPress 
    ? "Double tap to view streak details" 
    : undefined;

  const pressScale = useSharedValue(1);

  const handlePressIn = () => {
    pressScale.value = withSpring(0.95, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const pressAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  if (streak === 0) {
    return (
      <TouchableOpacity 
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.8}
        accessible={true}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityHint={accessibilityHint}
      >
        <Animated.View
          entering={FadeIn}
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.inputBackground,
              paddingHorizontal: config.padding,
              paddingVertical: config.padding * 0.6,
              borderRadius: 20,
              gap: 6,
            },
            pressAnimatedStyle,
          ]}
        >
          <Animated.View style={flameStyle}>
            <Flame size={config.flame} color={colors.textMuted} />
          </Animated.View>
          <Text
            style={{
              fontFamily: FontFamily.uiSemiBold,
              fontSize: config.number,
              color: colors.textMuted,
            }}
          >
            Start streak
          </Text>
        </Animated.View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.9}
      accessible={true}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
    >
      <Animated.View
        entering={FadeInUp}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          },
          pressAnimatedStyle,
        ]}
      >
        <Animated.View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: isDark ? 'rgba(200, 165, 92, 0.12)' : 'rgba(200, 165, 92, 0.08)',
              paddingHorizontal: config.padding,
              paddingVertical: config.padding * 0.6,
              borderRadius: 20,
              gap: 6,
              borderWidth: isMilestone ? 1.5 : 0,
              borderColor: isMilestone ? colors.accent : 'transparent',
            },
            containerGlowStyle,
            milestonePulseStyle,
          ]}
        >
          {showCelebration && (
            <View style={{ position: 'absolute', top: -20, left: 0, right: 0, alignItems: 'center' }}>
              <SparkleBurst trigger={showCelebration} />
            </View>
          )}
          
          <Animated.View style={flameStyle}>
            <Flame
              size={config.flame}
              color={colors.accent}
              fill={isLongStreak ? colors.accent : 'transparent'}
            />
          </Animated.View>
          
<Animated.Text
            style={[
              {
                fontFamily: FontFamily.uiSemiBold,
                fontSize: config.number,
                color: colors.text,
              },
              numberStyle,
            ]}
          >
            {displayStreak}
          </Animated.Text>
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 12, // Fixed size instead of multiplier
              color: colors.textMuted,
            }}
          >
            day{streak !== 1 ? 's' : ''}
          </Text>
        </Animated.View>

        {showFreeze && freezes > 0 && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.inputBackground,
              paddingHorizontal: config.padding * 0.8,
              paddingVertical: config.padding * 0.6,
              borderRadius: 20,
              gap: 4,
            }}
          >
            <Snowflake size={config.freeze} color={colors.textSubtle} />
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: 12, // Fixed size instead of multiplier
                color: colors.textSubtle,
              }}
            >
              {freezes}
            </Text>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}
