import React from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { StreakDisplay } from '@/components/StreakDisplay';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still awake?';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Wind down';
}

interface Props {
  userName?: string;
  onAvatarPress: () => void;
}

export function GreetingRow({ userName, onAvatarPress }: Props) {
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();

  return (
    <View
      style={{
        paddingHorizontal: Spacing['6'],
        paddingTop: Spacing['5'],
        paddingBottom: Spacing['3'],
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}
    >
      {/* Greeting text — stagger 0ms */}
      <Animated.View entering={entering(FadeIn.duration(Duration.normal).easing(Ease.out))} style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: FontFamily.bodyItalic,
            fontSize: 15,
            color: colors.textSubtle,
            marginBottom: 6,
          }}
        >
          {getGreeting()}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text
            style={{
              fontFamily: FontFamily.display,
              fontSize: 34,
              color: colors.text,
              letterSpacing: -0.5,
            }}
          >
            {userName}
          </Text>
          <StreakDisplay compact hideDayLabel />
        </View>
      </Animated.View>

      {/* Avatar — stagger 80ms per spec Zone 1 */}
      <Animated.View
        entering={entering(FadeIn.duration(Duration.normal).delay(80).easing(Ease.out))}
        style={{ marginTop: Spacing['1'] }}
      >
        <ProfileAvatar size={38} onPress={onAvatarPress} />
      </Animated.View>
    </View>
  );
}
