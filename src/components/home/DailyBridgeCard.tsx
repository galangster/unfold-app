import React from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { CompanionOrb } from '@/components/CompanionOrb';
import { alpha } from '@/components/ui';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  text: string;
  colors: ColorTheme;
}

export function DailyBridgeCard({ text, colors }: Props) {
  const { entering } = useAccessibleAnimation();

  return (
    <Animated.View
      entering={entering(FadeIn.duration(600))}
      style={{ paddingHorizontal: Spacing['6'], marginTop: Spacing['4'] }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        {/* Mini companion orb */}
        <View style={{ marginTop: 10 }}>
          <CompanionOrb accentColor={colors.accent} size={24} />
        </View>

        {/* Message bubble */}
        <View style={{ flex: 1 }}>
          <View
            style={{
              borderRadius: Radius.lg,
              borderWidth: 1,
              paddingVertical: Spacing['3'],
              paddingHorizontal: 14,
              backgroundColor: alpha(colors.accent, 0.06),
              borderColor: alpha(colors.accent, 0.13),
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: FontSize.sm,
                lineHeight: 22,
                color: colors.text,
              }}
            >
              {text}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
