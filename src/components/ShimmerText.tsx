import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import type { TextStyle, LayoutChangeEvent } from 'react-native';

interface ShimmerTextProps {
  text: string;
  style?: TextStyle;
  shimmerWidth?: number;
  sweepDuration?: number;
  pauseDuration?: number;
  initialDelay?: number;
}

export function ShimmerText({
  text,
  style,
  shimmerWidth = 60,
  sweepDuration = 800,
  pauseDuration = 2200,
  initialDelay = 0,
}: ShimmerTextProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const translateX = useSharedValue(-shimmerWidth);
  const [textWidth, setTextWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    setTextWidth(e.nativeEvent.layout.width);
  };

  useEffect(() => {
    if (reducedMotion || textWidth === 0) return;

    // Sweep from left edge to right edge, then pause, then repeat
    translateX.value = withDelay(
      initialDelay,
      withRepeat(
        withSequence(
          withTiming(textWidth, {
            duration: sweepDuration,
            easing: Easing.inOut(Easing.ease),
          }),
          withDelay(pauseDuration, withTiming(-shimmerWidth, { duration: 0 })),
        ),
        -1,
        false,
      ),
    );
  }, [reducedMotion, sweepDuration, pauseDuration, shimmerWidth, initialDelay, textWidth]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Reduced motion: plain text, no shimmer
  if (reducedMotion) {
    return <Text style={style}>{text}</Text>;
  }

  return (
    <View onLayout={onLayout}>
      {/* Base text layer — always visible */}
      <Text style={style}>{text}</Text>

      {/* Shimmer overlay — masked to text shape */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <MaskedView
          style={{ flex: 1 }}
          maskElement={
            <Text style={[style, { color: 'black' }]}>{text}</Text>
          }
        >
          <Animated.View
            style={[
              {
                flex: 1,
                width: shimmerWidth,
              },
              shimmerStyle,
            ]}
          >
            <LinearGradient
              colors={[
                'transparent',
                alpha(colors.accent, 0.18),
                'transparent',
              ]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </MaskedView>
      </View>
    </View>
  );
}
