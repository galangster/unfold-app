import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { CaretRightIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadow } from '@/constants/shadows';
import { Duration, Ease } from '@/constants/animations';
import { alpha } from '@/components/ui';
import { CompanionOrb } from '@/components/CompanionOrb';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  colors: ColorTheme;
  onPress: () => void;
  message: string;
  icon: React.ReactNode;
  accentColor: string;
  delay?: number;
}

export function NotificationCard({ colors, onPress, message, icon, accentColor, delay = 150 }: Props) {
  const { entering, exiting } = useAccessibleAnimation();

  return (
    <Animated.View
      entering={entering(FadeIn.duration(Duration.normal).delay(delay).easing(Ease.out))}
      exiting={exiting(FadeOut.duration(Duration.fast).easing(Ease.out))}
      style={{ paddingHorizontal: Spacing['6'], marginTop: Spacing['3'] }}
    >
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        <View
          style={[
            {
              borderRadius: Radius.card,
              paddingVertical: Spacing['4'],
              paddingHorizontal: Spacing['4'],
              paddingRight: Spacing['3'],
              flexDirection: 'row',
              alignItems: 'center',
              ...Shadow.sm,
            },
            { backgroundColor: alpha(accentColor, 0.05) },
          ]}
        >
          {/* Companion orb */}
          <View style={{ marginRight: Spacing['3'] }}>
            <CompanionOrb accentColor={accentColor} size={28} />
          </View>

          {/* Message text */}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: FontSize.sm,
                lineHeight: 20,
                color: colors.text,
              }}
            >
              {message}
            </Text>
          </View>

          {/* Action chevron */}
          <CaretRightIcon
            size={16}
            color={colors.textSubtle}
            weight="light"
            style={{ marginLeft: Spacing['2'] }}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
