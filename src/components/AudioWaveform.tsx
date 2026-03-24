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
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { Spacing } from '@/constants/spacing';

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
}

// Maximum number of bars we'll support
const MAX_BARS = 32;

export function AudioWaveform({
  isPlaying,
  activeWordIndex,
  totalWords,
  color: propColor,
  barCount = 20,
}: AudioWaveformProps) {
  const { colors } = useTheme();
  const color = propColor ?? colors.accent;
  const effectiveBarCount = Math.min(Math.max(1, Math.floor(barCount ?? 20)), MAX_BARS);

  // Create all shared values at top level - hooks must be called in same order every render
  const sv0 = useSharedValue(0.3);
  const sv1 = useSharedValue(0.3);
  const sv2 = useSharedValue(0.3);
  const sv3 = useSharedValue(0.3);
  const sv4 = useSharedValue(0.3);
  const sv5 = useSharedValue(0.3);
  const sv6 = useSharedValue(0.3);
  const sv7 = useSharedValue(0.3);
  const sv8 = useSharedValue(0.3);
  const sv9 = useSharedValue(0.3);
  const sv10 = useSharedValue(0.3);
  const sv11 = useSharedValue(0.3);
  const sv12 = useSharedValue(0.3);
  const sv13 = useSharedValue(0.3);
  const sv14 = useSharedValue(0.3);
  const sv15 = useSharedValue(0.3);
  const sv16 = useSharedValue(0.3);
  const sv17 = useSharedValue(0.3);
  const sv18 = useSharedValue(0.3);
  const sv19 = useSharedValue(0.3);
  const sv20 = useSharedValue(0.3);
  const sv21 = useSharedValue(0.3);
  const sv22 = useSharedValue(0.3);
  const sv23 = useSharedValue(0.3);
  const sv24 = useSharedValue(0.3);
  const sv25 = useSharedValue(0.3);
  const sv26 = useSharedValue(0.3);
  const sv27 = useSharedValue(0.3);
  const sv28 = useSharedValue(0.3);
  const sv29 = useSharedValue(0.3);
  const sv30 = useSharedValue(0.3);
  const sv31 = useSharedValue(0.3);

  // Array of all shared values for easy access
  const barValues: SharedValue<number>[] = useMemo(() => [
    sv0, sv1, sv2, sv3, sv4, sv5, sv6, sv7,
    sv8, sv9, sv10, sv11, sv12, sv13, sv14, sv15,
    sv16, sv17, sv18, sv19, sv20, sv21, sv22, sv23,
    sv24, sv25, sv26, sv27, sv28, sv29, sv30, sv31,
  ], [sv0, sv1, sv2, sv3, sv4, sv5, sv6, sv7, sv8, sv9, sv10, sv11, sv12, sv13, sv14, sv15, sv16, sv17, sv18, sv19, sv20, sv21, sv22, sv23, sv24, sv25, sv26, sv27, sv28, sv29, sv30, sv31]);

  // Create bar configs (static values, no hooks)
  const bars = useMemo(() => {
    return Array.from({ length: effectiveBarCount }, (_, i) => {
      const frequency = 0.5 + Math.sin((i / effectiveBarCount) * Math.PI) * 0.5;
      return {
        delay: i * 40,
        duration: 400 + frequency * 200,
        minHeight: 0.2 + frequency * 0.2,
        maxHeight: 0.6 + frequency * 0.3,
        frequency,
      };
    });
  }, [effectiveBarCount]);

  // Calculate progress through text
  const progress = totalWords > 0 ? activeWordIndex / totalWords : 0;
  const activeBarIndex = Math.floor(progress * effectiveBarCount);

  // Calculate inactive color with proper rgba
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
      bars.forEach((bar, i) => {
        const barValue = barValues[i];
        if (!barValue) return;
        const { maxHeight, minHeight } = bar;
        const staggerDelay = i * 30;

        barValue.value = withDelay(
          staggerDelay,
          withRepeat(
            withSequence(
              withSpring(maxHeight, {
                damping: 30 + Math.random() * 6,
                stiffness: 120 + Math.random() * 60,
                mass: 0.8 + Math.random() * 0.4,
              }),
              withSpring(minHeight, {
                damping: 26 + Math.random() * 6,
                stiffness: 100 + Math.random() * 40,
                mass: 0.8 + Math.random() * 0.4,
              })
            ),
            -1,
            true
          )
        ) as any;
      });
    } else {
      bars.forEach((bar, i) => {
        const barValue = barValues[i];
        if (!barValue) return;
        barValue.value = withDelay(
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
  }, [isPlaying, bars, barValues]);

  return (
    <View style={styles.container}>
      {bars.map((bar, i) => {
        const isActive = i <= activeBarIndex;
        const barValue = barValues[i];
        if (!barValue) return null;
        
        return (
          <WaveformBar
            key={i}
            barValue={barValue}
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
  barValue: SharedValue<number>;
  bar: BarConfig;
  isActive: boolean;
  activeColor: string;
  inactiveColor: string;
  index: number;
}

function WaveformBar({ barValue, bar, isActive, activeColor, inactiveColor, index }: WaveformBarProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    height: `${barValue.value * 100}%`,
    backgroundColor: isActive ? activeColor : inactiveColor,
    opacity: isActive ? 1 : 0.5,
    shadowColor: isActive ? activeColor : 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: isActive ? 0.6 : 0,
    shadowRadius: isActive ? 10 : 0,
    elevation: isActive ? 6 : 0,
  }));

  const width = 2.5 + (index % 4) * 0.8;
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
    paddingHorizontal: Spacing['4'],
  },
  bar: {
    borderRadius: 2,
    minHeight: 4,
  },
});
