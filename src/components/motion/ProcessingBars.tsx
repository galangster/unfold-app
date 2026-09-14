import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Ease } from '@/constants/animations';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import {
  PROCESSING_BAR_CYCLE_MS,
  PROCESSING_BAR_STAGGER_MS,
} from '@/lib/meaningful-motion';

const BAR_HEIGHTS = [11, 18, 8] as const;

function ProcessingBar({
  active,
  color,
  delay,
  height,
  reducedMotion,
}: {
  active: boolean;
  color: string;
  delay: number;
  height: number;
  reducedMotion: boolean;
}) {
  const opacity = useSharedValue(0.45);

  useEffect(() => {
    if (!active || reducedMotion) {
      cancelAnimation(opacity);
      opacity.value = 0.45;
      return;
    }

    opacity.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: PROCESSING_BAR_CYCLE_MS / 2, easing: Ease.inOut }),
        -1,
        true,
      ),
    );

    return () => cancelAnimation(opacity);
  }, [active, delay, opacity, reducedMotion]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          width: 2,
          height,
          borderRadius: 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

interface ProcessingBarsProps {
  active: boolean;
  color: string;
  testID?: string;
}

export function ProcessingBars({
  active,
  color,
  testID = 'voice-processing-bars',
}: ProcessingBarsProps) {
  const { reducedMotion } = useAccessibleAnimation();

  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height: 18,
        minWidth: 18,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      {BAR_HEIGHTS.map((height, index) => (
        <ProcessingBar
          key={index}
          active={active}
          color={color}
          delay={index * PROCESSING_BAR_STAGGER_MS}
          height={height}
          reducedMotion={reducedMotion}
        />
      ))}
    </View>
  );
}
