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
    // Fallback to default gold if color is undefined
    const safeColor = color || '#C8A55C';
    const hex = safeColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0.37)`;
  }, [color]);

  // Animate bars based on playback state
  useEffect(() => {
    if (isPlaying) {
      // Animate each bar with spring physics - more organic
      bars.forEach((bar, i) => {
        const { delay, maxHeight, minHeight } = bar;
        
        // Stagger the start for wave effect
        const staggerDelay = i * 30;

        bar.value = withDelay(
          staggerDelay,
          withRepeat(
            withSequence(
              withSpring(maxHeight, { 
                damping: 12 + Math.random() * 6, 
                stiffness: 120 + Math.random() * 60,
                mass: 0.8 + Math.random() * 0.4,
              }),
              withSpring(minHeight, { 
                damping: 14 + Math.random() * 6, 
                stiffness: 100 + Math.random() * 40,
                mass: 0.8 + Math.random() * 0.4,
              })
            ),
            -1, // Infinite repeat
            true // Reverse
          )
        ) as any;
      });
    } else {
      // Gentle breathing idle state when paused - more natural
      bars.forEach((bar, i) => {
        bar.value = withDelay(
          i * 80,
          withRepeat(
            withSequence(
              withTiming(0.32, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
              withTiming(0.22, { duration: 1200, easing: Easing.inOut(Easing.sin) })
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
    opacity: isActive ? 1 : 0.5,
    shadowColor: isActive ? activeColor : 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: isActive ? 0.6 : 0,
    shadowRadius: isActive ? 10 : 0,
    elevation: isActive ? 6 : 0,
  }));

  // Vary width slightly based on index for rhythm - more variation
  const width = 2.5 + (index % 4) * 0.8;
  
  // Vary border radius for organic feel
  const borderRadius = 1 + (index % 3);

  return (
    <Animated.View
      style={[
        styles.bar,
        animatedStyle,
        { width, borderRadius },
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
