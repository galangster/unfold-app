import React from 'react';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Duration, Ease } from '@/constants/animations';
import { TodayCompanionBubble } from '@/components/home/TodayCompanionBubble';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  colors: ColorTheme;
  onPress: () => void;
  message: string;
  icon: React.ReactNode;
  accentColor: string;
  delay?: number;
  label?: string;
  actionLabel?: string;
  onDismiss?: () => void;
}

export function NotificationCard({
  colors,
  onPress,
  message,
  icon,
  accentColor,
  delay = 150,
  label = 'Companion',
  actionLabel = 'Reflect',
  onDismiss,
}: Props) {
  const { entering, exiting } = useAccessibleAnimation();

  return (
    <Animated.View
      entering={entering(FadeIn.duration(Duration.normal).delay(delay).easing(Ease.out))}
      exiting={exiting(FadeOut.duration(Duration.fast).easing(Ease.out))}
    >
      <TodayCompanionBubble
        colors={colors}
        text={message}
        label={label}
        actionLabel={actionLabel}
        onPress={onPress}
        icon={icon}
        accentColor={accentColor}
        accessibilityLabel={`${label}: ${message}`}
        accessibilityHint={`Opens ${actionLabel.toLowerCase()} with the Companion`}
        onDismiss={onDismiss}
        dismissAccessibilityLabel={`Dismiss ${label.toLowerCase()} card`}
        dismissAccessibilityHint="Hides this optional check-in card for today"
      />
    </Animated.View>
  );
}
