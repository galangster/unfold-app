import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  withDelay,
  Easing,
} from 'react-native-reanimated';

interface AudioWaveformProps {
  isPlaying: boolean;
  activeWordIndex: number;
  totalWords: number;
  color?: string;
  barCount?: number;
}

interface BarConfig {
  delay: number;
  duration: number;
  minHeight: number;
  maxHeight: number;
  frequency: number;
  value: any;
}

export function AudioWaveform({
  isPlaying,
  activeWordIndex,
  totalWords,
  color = '#C8A55C',
  barCount = 20,
}: AudioWaveformProps) {
  // Create bar configs with pre-calculated harmonic values (no hooks in loops)
  const bars = useMemo(() => {
    return Array.from({ length: barCount }, (_, i) => {
      // Use sine-based frequency for harmonic relationship (not pure random)
      const frequency = 0.5 + Math.sin((i / barCount) * Math.PI) * 0.5;
      return {
        delay: i * 40,
        duration: 400 + frequency * 200,
        minHeight: 0.2 + frequency * 0.2,
        maxHeight: 0.6 + frequency * 0.3,
        frequency,
        value: useSharedValue(0.3),
      };
    });
  }, [barCount]);

  // Calculate progress through text
  const progress = totalWords > 0 ? activeWordIndex / totalWords : 0;
  const activeBarIndex = Math.floor(progress * barCount);

  // Calculate inactive color with proper rgba (not hex hack)
  const inactiveColor = useMemo(() => {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0.37)`;
  }, [color]);

  // Animate bars based on playback state
  useEffect(() => {
    if (isPlaying) {
      // Animate each bar with spring physics
      bars.forEach((bar) => {
        const { delay, duration, minHeight, maxHeight } = bar;

        bar.value = withDelay(
          delay,
          withRepeat(
            withSequence(
              withSpring(maxHeight, { damping: 15, stiffness: 150 }),
              withSpring(minHeight, { damping: 20, stiffness: 100 })
            ),
            -1, // Infinite repeat
            true // Reverse
          )
        ) as any;
      });
    } else {
      // Gentle breathing idle state when paused
      bars.forEach((bar, i) => {
        bar.value = withDelay(
          i * 100,
          withRepeat(
            withSequence(
              withTiming(0.35, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
              withTiming(0.25, { duration: 1000, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
          )
        ) as any;
      });
    }
  }, [isPlaying, bars]);

  return (
    <View style={styles.container}>
      {bars.map((bar, i) => {
        const isActive = i <= activeBarIndex;
        
        return (
          <WaveformBar
            key={i}
            bar={bar}
            isActive={isActive}
            activeColor={color}
            inactiveColor={inactiveColor}
            index={i}
          />
        );
      })}
    </View>
  );
}

// Separate component to properly use animated style hook
interface WaveformBarProps {
  bar: BarConfig;
  isActive: boolean;
  activeColor: string;
  inactiveColor: string;
  index: number;
}

function WaveformBar({ bar, isActive, activeColor, inactiveColor, index }: WaveformBarProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    height: `${bar.value.value * 100}%`,
    backgroundColor: isActive ? activeColor : inactiveColor,
    opacity: isActive ? 1 : 0.6,
    shadowColor: isActive ? activeColor : 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: isActive ? 0.5 : 0,
    shadowRadius: isActive ? 8 : 0,
    elevation: isActive ? 4 : 0,
  }));

  // Vary width slightly based on index for rhythm
  const width = 3 + (index % 3);

  return (
    <Animated.View
      style={[
        styles.bar,
        animatedStyle,
        { width },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    gap: 3,
    paddingHorizontal: 16,
  },
  bar: {
    borderRadius: 2,
    minHeight: 4,
  },
});
