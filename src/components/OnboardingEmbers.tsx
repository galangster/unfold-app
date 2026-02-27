import React, { useEffect, useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';

interface Ember {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
}

interface OnboardingEmbersProps {
  count?: number;
}

export const OnboardingEmbers: React.FC<OnboardingEmbersProps> = ({ count = 12 }) => {
  const { width, height } = useWindowDimensions();
  const { isDark } = useTheme();
  
  // Generate embers with random positions and timing
  const embers = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * width,
      y: height + Math.random() * 100,
      size: 2 + Math.random() * 4,
      delay: Math.random() * 8000,
      duration: 12000 + Math.random() * 8000, // 12-20s (much slower than completion)
      drift: (Math.random() - 0.5) * 60,
    }));
  }, [count, width, height]);

  return (
    <View style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} pointerEvents="none">
      {embers.map((ember) => (
        <EmberParticle key={ember.id} ember={ember} isDark={isDark} />
      ))}
    </View>
  );
};

const EmberParticle: React.FC<{ ember: Ember; isDark: boolean }> = ({ ember, isDark }) => {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0);

  useEffect(() => {
    // Slow, contemplative floating animation
    translateY.value = withDelay(
      ember.delay,
      withRepeat(
        withTiming(-ember.y - 100, {
          duration: ember.duration,
          easing: Easing.out(Easing.quad),
        }),
        -1,
        false
      )
    );

    translateX.value = withDelay(
      ember.delay,
      withRepeat(
        withTiming(ember.drift, {
          duration: ember.duration,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true
      )
    );

    // Gentle fade in/out
    opacity.value = withDelay(
      ember.delay,
      withRepeat(
        withTiming(1, { duration: ember.duration * 0.5, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      )
    );

    scale.value = withDelay(
      ember.delay,
      withRepeat(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale: scale.value },
    ],
    opacity: interpolate(
      opacity.value,
      [0, 0.3, 0.7, 1],
      [0, 0.6, 0.8, 0]
    ),
  }));

  // Colors adapt to theme
  const emberColor = isDark 
    ? 'rgba(214, 176, 95, 0.9)'  // Warm gold for dark
    : 'rgba(200, 150, 80, 0.85)'; // Softer amber for light

  const glowColor = isDark
    ? 'rgba(214, 176, 95, 0.3)'
    : 'rgba(200, 150, 80, 0.25)';

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: ember.x,
          top: ember.y,
          width: ember.size,
          height: ember.size,
          borderRadius: ember.size / 2,
          backgroundColor: emberColor,
          shadowColor: glowColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 1,
          shadowRadius: ember.size * 2,
          elevation: 0,
        },
        animatedStyle,
      ]}
    />
  );
};

export default OnboardingEmbers;
