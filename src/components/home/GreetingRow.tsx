import React, { useMemo, type ReactNode } from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { StreakDisplay } from '@/components/StreakDisplay';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { todayGreeting } from '@/constants/daily-copy';
import { copySeed } from '@/lib/copy-variation';
import { dayIndexFor } from '@/lib/variation-bag';

/** Chosen by the hour, worded by the bag: each part of the day has its own small pool. */
export function getGreeting(hour: number, dayIndex: number): string {
  return todayGreeting(hour, { seed: copySeed(), dayIndex });
}

interface Props {
  userName?: string;
  onAvatarPress: () => void;
  /** Test selector forwarded to the avatar button for e2e flows */
  avatarTestID?: string;
  headerActions?: ReactNode;
}

export function GreetingRow({ userName, onAvatarPress, avatarTestID, headerActions }: Props) {
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();
  // Drawn once per hour and local day, not on every render.
  const now = new Date();
  const hour = now.getHours();
  const dayIndex = dayIndexFor(now);
  const greeting = useMemo(() => getGreeting(hour, dayIndex), [hour, dayIndex]);

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
      <Animated.View entering={entering(FadeIn.duration(Duration.normal).easing(Ease.out))} style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: FontFamily.bodyItalic,
            fontSize: 15,
            color: colors.textMuted,
            marginBottom: 6,
          }}
        >
          {greeting}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <Text
            style={{
              fontFamily: FontFamily.display,
              fontSize: 30,
              color: colors.text,
              letterSpacing: -0.15,
              maxWidth: '100%',
              flexShrink: 1,
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
        style={{ marginTop: Spacing['1'], marginLeft: Spacing['3'], flexDirection: 'row', alignItems: 'center' }}
      >
        {headerActions}
        <ProfileAvatar size={38} onPress={onAvatarPress} testID={avatarTestID} />
      </Animated.View>
    </View>
  );
}
