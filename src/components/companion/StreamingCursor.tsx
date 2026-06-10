/**
 * StreamingCursor — blinking vertical bar in accent color.
 * Appears during streaming, fades out on completion.
 */
import { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';

const HALF_CYCLE = 500;

export function StreamingCursor() {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: HALF_CYCLE }),
        withTiming(1, { duration: HALF_CYCLE })
      ),
      -1
    );
  }, [opacity, reducedMotion]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          width: 2,
          height: 18,
          backgroundColor: colors.accent,
          borderRadius: 1,
          marginLeft: 1,
        },
        style,
      ]}
    />
  );
}
