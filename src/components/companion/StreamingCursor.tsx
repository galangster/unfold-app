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
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';

const HALF_CYCLE = 500;

export function StreamingCursor() {
  const { colors } = useTheme();
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: HALF_CYCLE }),
        withTiming(1, { duration: HALF_CYCLE })
      ),
      -1
    );
  }, [opacity]);

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
