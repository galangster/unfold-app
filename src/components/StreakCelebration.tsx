import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { FireIcon, SparkleIcon } from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';

interface StreakCelebrationProps {
  streak: number;
  onComplete?: () => void;
}

export function StreakCelebration({ streak, onComplete }: StreakCelebrationProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // Fade in
    opacity.value = withTiming(1, { duration: 200 });
    // Spring scale in, hold, then fade out
    scale.value = withSpring(1, { damping: 6, stiffness: 40 });
    // After hold, fade out and call onComplete
    opacity.value = withDelay(
      1700,
      withTiming(0, { duration: 300 }, (finished) => {
        if (finished && onComplete) {
          runOnJS(onComplete)();
        }
      }),
    );
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isMilestone = [7, 14, 30, 60, 100].includes(streak);

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 100,
          pointerEvents: 'none',
        },
        containerStyle,
      ]}
    >
      <Animated.View
        style={[
          { alignItems: 'center' },
          innerStyle,
        ]}
      >
        {isMilestone ? (
          <View style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <SparkleIcon size={40} color={colors.accent} weight="light" />
              <FireIcon size={60} color={colors.accent} weight="fill" />
              <SparkleIcon size={40} color={colors.accent} weight="light" />
            </View>
            <Animated.Text
              entering={FadeIn.delay(200)}
              style={{
                fontFamily: 'System',
                fontSize: 28,
                fontWeight: 'bold',
                color: colors.accent,
                marginTop: 16,
              }}
            >
              {streak} Days!
            </Animated.Text>
          </View>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <FireIcon size={50} color={colors.accent} weight="fill" />
            <Animated.Text
              entering={FadeIn.delay(200)}
              style={{
                fontFamily: 'System',
                fontSize: 24,
                fontWeight: '600',
                color: colors.accent,
                marginTop: 12,
              }}
            >
              +1
            </Animated.Text>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}
