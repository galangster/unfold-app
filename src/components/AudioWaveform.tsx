import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';

interface AudioWaveformProps {
  isPlaying: boolean;
  activeWordIndex: number;
  totalWords: number;
  color?: string;
  barCount?: number;
}

export function AudioWaveform({
  isPlaying,
  activeWordIndex,
  totalWords,
  color = '#C8A55C',
  barCount = 20,
}: AudioWaveformProps) {
  // Create animated values for each bar
  const bars = useMemo(() => {
    return Array.from({ length: barCount }, () => useSharedValue(0.3));
  }, [barCount]);

  // Animate bars based on playback state
  useEffect(() => {
    if (isPlaying) {
      // Animate each bar with different timing for organic feel
      bars.forEach((bar, i) => {
        const delay = i * 50;
        const duration = 400 + Math.random() * 200;
        const minHeight = 0.2 + Math.random() * 0.3;
        const maxHeight = 0.6 + Math.random() * 0.4;

        bar.value = withRepeat(
          withSequence(
            withTiming(maxHeight, { duration }),
            withTiming(minHeight, { duration: duration * 0.8 })
          ),
          -1, // Infinite repeat
          true // Reverse
        );
      });
    } else {
      // Reset to idle state when paused
      bars.forEach((bar) => {
        bar.value = withTiming(0.3, { duration: 300 });
      });
    }
  }, [isPlaying, bars]);

  // Highlight bars based on progress through the text
  const progress = totalWords > 0 ? activeWordIndex / totalWords : 0;
  const activeBarIndex = Math.floor(progress * barCount);

  return (
    <View style={styles.container}>
      {bars.map((bar, i) => {
        const isActive = i <= activeBarIndex;
        
        const animatedStyle = useAnimatedStyle(() => ({
          height: `${bar.value * 100}%`,
          opacity: isActive ? 1 : 0.4,
          backgroundColor: isActive ? color : color + '60', // 60 = ~37% opacity
        }));

        return (
          <Animated.View
            key={i}
            style={[
              styles.bar,
              animatedStyle,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    gap: 4,
    paddingHorizontal: 16,
  },
  bar: {
    width: 4,
    borderRadius: 2,
    minHeight: 4,
  },
});
