import { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import type { ColorTheme } from '@/constants/colors';

interface ShockStatProps {
  colors: ColorTheme;
  onReady?: () => void;
}

export function ShockStat({ colors, onReady }: ShockStatProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onReady?.();
    }, 1600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: Spacing['6'] }}>
      <Animated.View entering={FadeIn.duration(600)} style={{ marginBottom: Spacing['6'] }}>
        <Text style={{
          fontFamily: FontFamily.display,
          fontSize: 40,
          color: colors.accent,
          letterSpacing: -1,
        }}>
          93%
        </Text>
        <Text style={{
          fontFamily: FontFamily.body,
          fontSize: 15,
          color: colors.textMuted,
          lineHeight: 22,
          marginTop: Spacing['1'],
        }}>
          of Christians want a deeper relationship with God.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(800).duration(600)}>
        <Text style={{
          fontFamily: FontFamily.display,
          fontSize: 40,
          color: colors.accent,
          letterSpacing: -1,
        }}>
          11%
        </Text>
        <Text style={{
          fontFamily: FontFamily.body,
          fontSize: 15,
          color: colors.textMuted,
          lineHeight: 22,
          marginTop: Spacing['1'],
        }}>
          read the Bible daily.
        </Text>
      </Animated.View>
    </View>
  );
}
