import React from 'react';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Duration, Ease } from '@/constants/animations';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { TodayCompanionBubble } from '@/components/home/TodayCompanionBubble';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  text: string;
  colors: ColorTheme;
}

export function DailyBridgeCard({ text, colors }: Props) {
  const { entering } = useAccessibleAnimation();

  return (
    <Animated.View entering={entering(FadeIn.duration(Duration.normal).easing(Ease.out))}>
      <TodayCompanionBubble colors={colors} text={text} />
    </Animated.View>
  );
}
