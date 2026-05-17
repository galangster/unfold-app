import React from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { XIcon } from 'phosphor-react-native';
import { Radius } from '@/constants/radius';
import { alpha } from '@/components/ui';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  colors: ColorTheme;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

export function DismissCircleButton({
  colors,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
}: Props) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={[
        styles.button,
        {
          backgroundColor: alpha(colors.backgroundElevated, 0.94),
          borderColor: alpha(colors.text, 0.15),
          shadowColor: colors.text,
        },
        style,
      ]}
    >
      <XIcon size={12} color={colors.textSubtle} weight="regular" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 2,
  },
});
