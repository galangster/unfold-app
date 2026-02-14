import { View, Text } from 'react-native';
import { Flame, Snowflake } from 'lucide-react-native';
import Animated, { 
  FadeIn, 
  FadeInUp, 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  useDerivedValue,
  runOnJS,
} from 'react-native-reanimated';
import { useEffect, useState } from 'react';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';

interface StreakDisplayProps {
  size?: 'small' | 'medium' | 'large';
  compact?: boolean;
  showFreeze?: boolean;
}

export function StreakDisplay({ size = 'medium', compact, showFreeze = true }: StreakDisplayProps) {
  const { colors, isDark } = useTheme();
  const streak = useUnfoldStore((s) => s.streakCurrent);
  const freezes = useUnfoldStore((s) => s.streakFreezes);

  // Animated streak value for spring animation
  const animatedStreak = useSharedValue(streak);
  const [displayStreak, setDisplayStreak] = useState(streak);

  // Spring animation when streak changes
  useEffect(() => {
    if (streak !== animatedStreak.value) {
      animatedStreak.value = withSpring(streak, {
        damping: 15,
        stiffness: 100,
        mass: 1,
      });
    }
  }, [streak]);

  // Update display value during animation
  const animatedValue = useDerivedValue(() => {
    runOnJS(setDisplayStreak)(Math.round(animatedStreak.value));
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

  // Animated style for the number
  const numberStyle = useAnimatedStyle(() => ({
    transform: [{ 
      scale: 1 + (animatedStreak.value - Math.round(animatedStreak.value)) * 0.1 
    }],
  }));

  if (streak === 0) {
    return (
      <Animated.View
        entering={FadeIn}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.inputBackground,
          paddingHorizontal: config.padding,
          paddingVertical: config.padding * 0.6,
          borderRadius: 20,
          gap: 6,
        }}
      >
        <Flame size={config.flame} color={colors.textMuted} />
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
    );
  }

  return (
    <Animated.View
      entering={FadeInUp}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isDark ? 'rgba(200, 165, 92, 0.15)' : 'rgba(200, 165, 92, 0.1)',
          paddingHorizontal: config.padding,
          paddingVertical: config.padding * 0.6,
          borderRadius: 20,
          gap: 6,
        }}
      >
        <Flame
          size={config.flame}
          color="#C8A55C"
          fill={streak >= 7 ? '#C8A55C' : 'transparent'}
        />
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
            fontSize: config.number * 0.7,
            color: colors.textMuted,
          }}
        >
          day{streak !== 1 ? 's' : ''}
        </Text>
      </View>

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
              fontSize: config.number * 0.75,
              color: colors.textSubtle,
            }}
          >
            {freezes}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}
